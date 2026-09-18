import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { Experiment, summarize } from "../server/experiment.js";
import { connectMcp } from "../server/mcp-client.js";
import {
  createRouters,
  buildJevPayload,
  buildLlmPayload,
  parseLlm,
  readMetrics,
} from "../server/routers.js";
import { makeState, validateDecision } from "../server/catalog.js";
import { dataset } from "../server/dataset.js";

// All synthetic provider responses are confined to tests. Production has no
// mock router, fallback classifier, or synthetic metrics.
const ok = (tool = "get_service_health") => ({
  status: "ok",
  tool,
  arguments: { service: "auth", environment: "production" },
  routingLatencyMs: 10,
  costUsd: null,
});
async function storeAt() {
  const directory = await mkdtemp(join(tmpdir(), "route-lab-test-"));
  return new Store(join(directory, "events.jsonl")).init();
}

test("real MCP discovery exposes exactly five read-only tools and executes fixtures", async () => {
  const mcp = await connectMcp();
  try {
    assert.equal(mcp.tools.length, 5);
    for (const t of mcp.tools) {
      assert.equal(t.annotations.readOnlyHint, true);
      const output = await mcp.callTool({
        name: t.name,
        arguments: { service: "billing", environment: "staging" },
      });
      assert.ok(!output.isError);
      const data = JSON.parse(output.content[0].text);
      assert.equal(data.service, "billing");
      assert.match(data.source, /Static demo fixture/);
    }
    const bad = await mcp.callTool({
      name: "get_service_health",
      arguments: { service: "unknown", environment: "production" },
    });
    assert.equal(bad.isError, true);
  } finally {
    await mcp.close();
  }
});

test("shared inputs, descriptions, and enum schemas are identical; labels never reach models", async () => {
  const mcp = await connectMcp();
  try {
    const store = await storeAt(),
      inputs = [];
    const routers = {
      run: async (_router, state) => {
        inputs.push(state);
        return ok();
      },
    };
    const experiment = new Experiment({ mcp, routers, store });
    const c = await experiment.compare({
      request: "  Is auth healthy?\n",
      expectedTool: "get_service_health",
    });
    assert.deepEqual(inputs[0], inputs[1]);
    assert.equal(inputs[0].userRequest, "  Is auth healthy?\n");
    assert.ok(!("expectedTool" in inputs[0]));
    const llm = buildLlmPayload(inputs[0], "test-model"),
      jev = buildJevPayload(inputs[1], "test-model");
    assert.equal(llm.messages[1].content, JSON.stringify(jev.state));
    for (const tool of mcp.tools) {
      assert.equal(
        llm.tools.find((t) => t.function.name === tool.name).function
          .description,
        jev.questions.route.criteria[tool.name],
      );
      assert.deepEqual(
        llm.tools.find((t) => t.function.name === tool.name).function.parameters
          .properties,
        tool.inputSchema.properties,
      );
    }
    assert.equal(c.correctness.llm.tool, true);
    assert.equal(c.sameTool, true);
    assert.equal(store.executions.size, 0);
  } finally {
    await mcp.close();
  }
});

test("missing keys return null measurements and make zero provider calls", async () => {
  const mcp = await connectMcp();
  try {
    const routers = createRouters({}, () => {
      throw new Error("Must not fetch");
    });
    for (const name of ["llm", "jev"]) {
      const result = await routers.run(name, makeState("hello", mcp.tools));
      assert.equal(result.status, "not_configured");
      for (const field of [
        "routingLatencyMs",
        "confidence",
        "costUsd",
        "usage",
        "selectedProbability",
      ])
        assert.equal(result[field], null);
    }
  } finally {
    await mcp.close();
  }
});

test("Jev adapter preserves real returned metrics and measures the complete HTTP attempt", async () => {
  const mcp = await connectMcp();
  try {
    const raw = {
      model: "test-jev",
      answers: {
        route: {
          type: "choice",
          choice: "get_service_health",
          probabilities: { get_service_health: 0.8, no_tool: 0.2 },
          confidence: 0.6,
        },
        service: { type: "choice", choice: "auth" },
        environment: { type: "choice", choice: "production" },
      },
      usage: { input_tokens: 100, output_tokens: 20 },
    };
    const routers = createRouters(
      { TYPESAFE_API_KEY: "test-only" },
      async (url, options) => {
        assert.equal(url, "https://api.typesafe.ai/v1/systemone");
        assert.equal(
          JSON.parse(options.body).state.userRequest,
          "Is auth healthy?",
        );
        return new Response(JSON.stringify(raw), {
          headers: { "x-request-id": "test-id" },
        });
      },
    );
    const result = await routers.run(
      "jev",
      makeState("Is auth healthy?", mcp.tools),
    );
    assert.equal(result.status, "ok");
    assert.equal(result.confidence, 0.6);
    assert.equal(result.selectedProbability, 0.8);
    assert.deepEqual(result.rawResponse, raw);
    assert.equal(result.usage.inputTokens, 100);
    assert.equal(result.costUsd, null);
    assert.ok(result.routingLatencyMs >= 0);
    assert.equal(result.requestId, "test-id");
    assert.ok(!JSON.stringify(result).includes("test-only"));
  } finally {
    await mcp.close();
  }
});

test("LLM adapter preserves usage, rejects invalid/multiple routes, and never infers confidence", async () => {
  const mcp = await connectMcp();
  try {
    const raw = {
      model: "test-llm",
      choices: [
        {
          message: {
            role: "assistant",
            tool_calls: [
              {
                type: "function",
                function: {
                  name: "get_service_health",
                  arguments: '{"service":"auth","environment":"production"}',
                },
              },
            ],
          },
        },
      ],
      usage: { input_tokens: 91, output_tokens: 13 },
    };
    const routers = createRouters(
      { OPENROUTER_API_KEY: "test-only" },
      async () => new Response(JSON.stringify(raw)),
    );
    const result = await routers.run(
      "llm",
      makeState("Is auth healthy?", mcp.tools),
    );
    assert.equal(result.status, "ok");
    assert.equal(result.confidence, null);
    assert.equal(result.usage.outputTokens, 13);
    assert.throws(
      () =>
        parseLlm({
          ...raw,
          choices: [
            {
              message: {
                tool_calls: [
                  ...raw.choices[0].message.tool_calls,
                  ...raw.choices[0].message.tool_calls,
                ],
              },
            },
          ],
        }),
      /multiple/,
    );
    assert.throws(() => parseLlm({ choices: [] }), /incomplete/);
    assert.throws(() =>
      validateDecision(
        {
          ...ok(),
          arguments: { service: "unknown", environment: "production" },
        },
        mcp.tools,
      ),
    );
    assert.throws(() => validateDecision(ok("delete_database"), mcp.tools));
    assert.throws(() =>
      validateDecision(
        { ...ok(), arguments: { ...ok().arguments, command: "rm" } },
        mcp.tools,
      ),
    );
    assert.deepEqual(
      parseLlm({ choices: [{ message: { content: "no_tool" } }] }),
      { tool: "no_tool", arguments: {} },
    );
    assert.throws(() =>
      parseLlm({ choices: [{ message: { content: "not a decision" } }] }),
    );
    assert.equal(
      readMetrics(
        {
          answers: {
            route: {
              confidence: 0,
              probabilities: { no_tool: 0 },
              choice: "no_tool",
            },
          },
        },
        "jev",
      ).confidence,
      0,
    );
  } finally {
    await mcp.close();
  }
});

test("HTTP failure is measured but does not acquire fabricated usage or confidence", async () => {
  const mcp = await connectMcp();
  try {
    const routers = createRouters(
      { TYPESAFE_API_KEY: "test" },
      async () => new Response("{}", { status: 429 }),
    );
    const result = await routers.run("jev", makeState("health", mcp.tools));
    assert.equal(result.status, "error");
    assert.match(result.error, /429/);
    assert.ok(result.routingLatencyMs >= 0);
    assert.equal(result.usage, null);
    assert.equal(result.costUsd, null);
    assert.equal(result.confidence, null);
  } finally {
    await mcp.close();
  }
});

test("racing route selections execute once; durable claims survive restart and failure", async () => {
  const real = await connectMcp();
  try {
    let calls = 0;
    const mcp = {
      tools: real.tools,
      callTool: async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return { content: [] };
      },
    };
    const store = await storeAt(),
      routers = { run: async () => ok() };
    const experiment = new Experiment({ mcp, store, routers });
    const comparison = await experiment.compare({
      request: "Is auth healthy?",
    });
    assert.equal(calls, 0);
    const outcomes = await Promise.allSettled([
      experiment.execute(comparison.id, "llm"),
      experiment.execute(comparison.id, "jev"),
    ]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(calls, 1);
    const restored = new Experiment({
      mcp,
      store: await new Store(store.path).init(),
      routers,
    });
    await assert.rejects(restored.execute(comparison.id, "jev"), /already/);
    assert.equal(calls, 1);
    const second = await experiment.compare({ request: "Is auth healthy?" });
    mcp.callTool = async () => {
      calls++;
      throw new Error("Transport lost");
    };
    assert.equal((await experiment.execute(second.id, "llm")).status, "failed");
    await assert.rejects(experiment.execute(second.id, "jev"), /already/);
    assert.equal(calls, 2);
    const third = await experiment.compare({ request: "Is auth healthy?" });
    await store.append({
      type: "execution",
      id: third.id,
      value: { status: "claimed", router: "llm" },
    });
    const afterCrash = new Experiment({
      mcp,
      store: await new Store(store.path).init(),
      routers,
    });
    await assert.rejects(afterCrash.execute(third.id, "jev"), /already/);
  } finally {
    await real.close();
  }
});

test("all 20 benchmark cases are balanced and permanently non-executable", async () => {
  const real = await connectMcp();
  try {
    let calls = 0;
    const mcp = {
      tools: real.tools,
      callTool: async () => {
        calls++;
      },
    };
    const experiment = new Experiment({
      mcp,
      store: await storeAt(),
      routers: { run: async () => ok() },
    });
    assert.equal(dataset.length, 20);
    assert.equal(new Set(dataset.map((c) => c.id)).size, 20);
    for (const t of real.tools)
      assert.equal(dataset.filter((c) => c.expectedTool === t.name).length, 4);
    const results = [];
    for (const item of dataset) {
      validateDecision(
        { tool: item.expectedTool, arguments: item.expectedArguments },
        real.tools,
      );
      const c = await experiment.compare({
        ...item,
        caseId: item.id,
        batchId: "test-batch",
      });
      results.push(c);
      await assert.rejects(experiment.execute(c.id, "llm"), /dry-run/);
    }
    assert.equal(calls, 0);
    const summary = summarize(results);
    assert.equal(summary.llm.accuracy, 0.2);
    assert.equal(summary.agreement, 1);
    assert.equal(summary.llm.meanCostUsd, null);
    assert.equal(summary.llm.costSamples, 0);
  } finally {
    await real.close();
  }
});

test("summary counts errors as misses and separates agreement and latency denominators", () => {
  const records = [
    {
      expectedTool: "get_service_health",
      llm: ok(),
      jev: ok(),
      sameTool: true,
      correctness: {
        llm: { tool: true, arguments: true },
        jev: { tool: true, arguments: true },
      },
    },
    {
      expectedTool: "get_service_health",
      llm: { ...ok(), status: "error", routingLatencyMs: 200 },
      jev: ok(),
      sameTool: null,
      correctness: {
        llm: { tool: false, arguments: false },
        jev: { tool: true, arguments: true },
      },
    },
  ];
  const summary = summarize(records);
  assert.equal(summary.llm.accuracy, 0.5);
  assert.equal(summary.llm.meanLatencyMs, 10);
  assert.equal(summary.pairedCount, 1);
  assert.equal(summary.agreement, 1);
});

test('Jev-only routing never invokes the LLM and still executes through MCP once', async () => {
  const mcp = await connectMcp();
  try {
    const seen = [];
    const store = await storeAt();
    const experiment = new Experiment({ mcp, store, routers: { run: async provider => { seen.push(provider); return ok(); } } });
    const run = await experiment.compare({ request: 'Is auth healthy?', compareLlm: false });
    assert.deepEqual(seen, ['jev']);
    assert.equal(run.llm.status, 'skipped');
    assert.equal(run.sameTool, null);
    await assert.rejects(experiment.execute(run.id, 'llm'), /not executable/);
    const execution = await experiment.execute(run.id, 'jev');
    assert.equal(execution.status, 'completed');
    await assert.rejects(experiment.execute(run.id, 'jev'), /second route/);
  } finally { await mcp.close(); }
});
