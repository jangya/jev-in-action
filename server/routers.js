import { performance } from "node:perf_hooks";
import { POLICY, validateDecision } from "./catalog.js";

const numberOrNull = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const probabilityOrNull = (value) =>
  numberOrNull(value) !== null && value <= 1 ? value : null;

export function buildLlmPayload(state, model) {
  return {
    model,
    parallel_tool_calls: false,
    tool_choice: "auto",
    messages: [
      {
        role: "system",
        content: `${POLICY} If the outcome is no_tool, respond with the text no_tool and do not emit a tool call. Otherwise emit exactly one tool call.`,
      },
      { role: "user", content: JSON.stringify(state) },
    ],
    tools: state.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: { ...t.inputSchema, additionalProperties: false },
        strict: true,
      },
    })),
  };
}

export function buildJevPayload(state, model) {
  // All five tools share the same argument schema. Derive options from MCP,
  // so no handwritten descriptions or hidden hints differ between routers.
  const fields = state.tools[0].inputSchema.properties;
  const questions = {
    route: {
      type: "choice",
      instructions: `${POLICY} Which tool best satisfies userRequest?`,
      criteria: {
        ...Object.fromEntries(state.tools.map((t) => [t.name, t.description])),
        no_tool:
          "No supported single read-only tool satisfies this request under routingPolicy.",
      },
    },
  };
  for (const [name, field] of Object.entries(fields)) {
    questions[name] = {
      type: "choice",
      instructions: `If userRequest is supported, select its ${name} argument. ${field.description} Follow routingPolicy. Select unspecified if the value cannot be determined under that policy.`,
      criteria: {
        ...Object.fromEntries(field.enum.map((value) => [value, value])),
        unspecified: "No valid value can be determined.",
      },
    };
  }
  return { model, state, questions };
}

export function parseLlm(raw) {
  const choice = raw.choices?.[0];
  if (!choice?.message)
    throw new Error("LLM response was incomplete or malformed.");
  const calls =
    choice.message.tool_calls?.filter((item) => item.type === "function") ?? [];
  if (calls.length > 1)
    throw new Error("LLM returned multiple tool calls; execution is disabled.");
  if (!calls.length) {
    const text =
      typeof choice.message.content === "string"
        ? choice.message.content.trim()
        : "";
    if (text !== "no_tool")
      throw new Error(
        "LLM did not return a tool call or an explicit no_tool decision.",
      );
    return { tool: "no_tool", arguments: {} };
  }
  return {
    tool: calls[0].function.name,
    arguments: JSON.parse(calls[0].function.arguments),
  };
}

export function parseJev(raw) {
  const route = raw.answers?.route;
  if (route?.type !== "choice" || typeof route.choice !== "string")
    throw new Error("Jev did not return a route Choice.");
  return {
    tool: route.choice,
    arguments:
      route.choice === "no_tool"
        ? {}
        : {
            service: raw.answers?.service?.choice,
            environment: raw.answers?.environment?.choice,
          },
  };
}

export function readMetrics(raw, router) {
  const route = router === "jev" ? raw.answers?.route : null;
  const probabilities =
    route?.probabilities &&
    Object.values(route.probabilities).every(
      (p) => probabilityOrNull(p) !== null,
    )
      ? route.probabilities
      : null;
  return {
    usage: raw.usage
      ? {
          inputTokens: numberOrNull(
            raw.usage.input_tokens ?? raw.usage.prompt_tokens,
          ),
          outputTokens: numberOrNull(
            raw.usage.output_tokens ?? raw.usage.completion_tokens,
          ),
          cachedInputTokens: numberOrNull(
            raw.usage.input_tokens_details?.cached_tokens ??
              raw.usage.prompt_tokens_details?.cached_tokens,
          ),
          raw: raw.usage,
        }
      : null,
    confidence: probabilityOrNull(route?.confidence),
    probabilities,
    selectedProbability: probabilityOrNull(probabilities?.[route?.choice]),
    // Neither documented response contract returns a per-request billed USD amount.
    // No guessed prices, token estimates, or confidence-derived costs.
    costUsd: null,
    costSource: "unavailable",
  };
}

export function createRouters(env = process.env, fetchImpl = fetch) {
  const config = {
    llm: {
      model: env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
      key: env.OPENROUTER_API_KEY,
      url: "https://openrouter.ai/api/v1/chat/completions",
      build: buildLlmPayload,
      parse: parseLlm,
    },
    jev: {
      model: env.TYPESAFE_MODEL || "jev-latest",
      key: env.TYPESAFE_API_KEY,
      url: "https://api.typesafe.ai/v1/systemone",
      build: buildJevPayload,
      parse: parseJev,
    },
  };
  return {
    status: Object.fromEntries(
      Object.entries(config).map(([id, c]) => [
        id,
        { model: c.model, configured: Boolean(c.key) },
      ]),
    ),
    async complete(payload, key, signal) {
      const credential = key || config.llm.key;
      if (!credential) throw new Error("Add an OpenRouter API key.");
      const response = await fetchImpl(config.llm.url, {
        method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: signal || AbortSignal.timeout(45000),
      });
      if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status}. Check credentials, model access, and quota.`);
      return response.json();
    },
    async decide(state, questions, key, signal) {
      const credential = key || config.jev.key;
      if (!credential) throw Object.assign(new Error("Add your Jev API key to run this demo."), { status: 401 });
      const start = performance.now();
      const providerPayload = { model: config.jev.model, state, questions };
      let response;
      try {
        response = await fetchImpl(config.jev.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
          body: JSON.stringify(providerPayload),
          signal: signal || AbortSignal.timeout(45000),
        });
      } catch {
        throw Object.assign(new Error("Could not reach Jev. Check your connection and try again."), { status: 502 });
      }
      if (!response.ok) throw Object.assign(new Error(`Jev returned HTTP ${response.status}. Check your API key, model access, or quota.`), { status: 502 });
      const raw = await response.json();
      const answers = {};
      for (const [id, question] of Object.entries(questions)) {
        const answer = raw.answers?.[id];
        if (answer?.type !== "choice" || !Object.hasOwn(question.criteria, answer.choice)) {
          throw Object.assign(new Error("Jev returned an invalid decision. Nothing was selected."), { status: 502, rawResponse: raw });
        }
        answers[id] = { choice: answer.choice, confidence: probabilityOrNull(answer.confidence) };
      }
      return { providerPayload, rawResponse: raw, answers, model: raw.model || config.jev.model, latencyMs: Math.round(performance.now() - start), usage: readMetrics(raw, 'jev').usage, calls: 1 };
    },
    async run(router, state, keys = {}) {
      const c = { ...config[router], key: keys[router] || config[router].key, model: router === 'llm' ? keys.llmModel || config[router].model : config[router].model };
      const payload = c.build(state, c.model);
      const result = {
        router,
        requestedModel: c.model,
        model: null,
        status: "error",
        tool: null,
        arguments: null,
        routingLatencyMs: null,
        latencySource:
          "server wall-clock; includes network and parsing; excludes MCP execution",
        ...readMetrics({}, router),
        requestId: null,
        providerPayload: payload,
        rawResponse: null,
        error: null,
      };
      if (!c.key)
        return {
          ...result,
          status: "not_configured",
          error: `Set ${router === "llm" ? "OPENROUTER_API_KEY" : "TYPESAFE_API_KEY"} in .env and restart.`,
        };
      const start = performance.now();
      try {
        const response = await fetchImpl(c.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${c.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(45000),
        });
        result.requestId =
          response.headers.get("x-request-id") ||
          response.headers.get("x-openrouter-request-id");
        if (!response.ok) {
          throw new Error(`Provider returned HTTP ${response.status}. Check credentials, model access, quota, or rate limits. No automatic retry was made.`);
        }
        const raw = await response.json();
        result.rawResponse = raw;
        result.model = raw.model ?? null;
        Object.assign(result, readMetrics(raw, router));
        // Preserve the original decision even if schema validation fails.
        const decision = c.parse(raw);
        Object.assign(result, decision);
        Object.assign(result, validateDecision(decision, state.tools));
        result.status = "ok";
      } catch (error) {
        result.error =
          error.name === "TimeoutError"
            ? "Provider request timed out after 45 seconds. No retry was made."
            : error.message;
      } finally {
        result.routingLatencyMs =
          Math.round((performance.now() - start) * 100) / 100;
      }
      return result;
    },
  };
}
