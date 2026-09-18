import { keyHeaders } from './credentials.js';
const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const json = (value) => JSON.stringify(value, null, 2);
const pct = (value) =>
  value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
const ms = (value) =>
  value == null ? "—" : `${Math.round(value).toLocaleString()} ms`;
let config,
  current = null,
  history = [],
  busy = false,
  batchResults = [];

async function api(path, body) {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json", ...keyHeaders() },
          body: JSON.stringify(body),
        }
      : { headers: keyHeaders() },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function message(text = "") {
  $("message").textContent = text;
  $("message").hidden = !text;
}
function setBusy(value) {
  busy = value;
  $("compare-button").disabled = value;
  $("try-mcp-prompt").disabled = value || !config?.dataset?.length;
  $("benchmark-button").disabled =
    value || !config?.routers.llm.configured || !config?.routers.jev.configured;
  $("compare-llm").disabled = value;
  $("compare-button").textContent = value ? "Working…" : $("compare-llm").checked ? "Compare routers ↗" : "Route with Jev ↗";
  executionControls();
}
function showView(view) {
  $("benchmark-view").open = view === "benchmark";
  if (view === "compare") $("request-form").scrollIntoView({ block: "nearest" });
}
function updateMode() {
  renderComparison(null);
  setBusy(busy);
  if (config) $("setup").textContent = $("compare-llm").checked
    ? 'Optional comparison uses Jev and OpenRouter. Configure both providers in API key settings on the playground. The benchmark also uses both.'
    : 'Jev-only routing. OpenRouter is not called. Real MCP calls return sample service data.';
}

function verdict(value) {
  return value === null || value === undefined
    ? "Not labeled"
    : value
      ? "Correct tool"
      : "Incorrect / failed";
}
function card(router, result, correctness) {
  const title = router === "llm" ? "LLM router" : "TypeSafe Jev";
  const status = !result
    ? "Awaiting input"
    : result.status === "ok"
      ? verdict(correctness)
      : result.status === "not_configured"
        ? "Setup required"
        : "Routing failed";
  const usage = result?.usage;
  const tokens =
    usage?.inputTokens != null && usage?.outputTokens != null
      ? (usage.inputTokens + usage.outputTokens).toLocaleString()
      : "—";
  const detail = usage
    ? `${usage.inputTokens ?? "—"} in / ${usage.outputTokens ?? "—"} out`
    : "Not returned";
  const probabilities = result?.probabilities;
  return `<article class="router-card ${router}"><div class="router-header"><div class="router-name"><span class="router-icon" aria-hidden="true">${router === "llm" ? "⌘" : "J"}</span><div><h2>${title}</h2><p class="model">${escape(result?.model || config?.routers[router].model || "Loading…")}</p></div></div><span class="badge ${correctness === true ? "good" : correctness === false ? "bad" : ""}">${status}</span></div>
  <div class="router-body"><p class="field-label">Selected tool</p><p class="tool-value">${escape(result?.tool || "—")}</p><p class="field-label">Arguments</p><pre class="arguments">${escape(result?.arguments ? json(result.arguments) : "No routing decision yet.")}</pre>
  <div class="metrics"><div><p class="metric-label">Routing latency</p><p class="metric-value">${ms(result?.routingLatencyMs)}</p><p class="metric-detail">${result?.routingLatencyMs != null ? "Measured · includes network" : "Not measured"}</p></div><div><p class="metric-label">Tokens</p><p class="metric-value">${tokens}</p><p class="metric-detail">${detail}</p></div><div><p class="metric-label">API cost</p><p class="metric-value">${result?.costUsd != null ? "$" + result.costUsd.toFixed(6) : "—"}</p><p class="metric-detail">${result?.costUsd != null ? escape(result.costSource) : "Unavailable · not zero"}</p></div></div>
  <div class="confidence-row"><span>Route confidence <strong>${result?.confidence != null ? pct(result.confidence) : "—"}</strong></span><span>Selected probability <strong>${result?.selectedProbability != null ? pct(result.selectedProbability) : "—"}</strong></span></div>
  <p class="metric-detail">${router === "jev" ? "Confidence describes the distribution, not guaranteed correctness." : "Function calling does not report calibrated route confidence."}</p>
  ${result?.error ? `<p class="error-text">${escape(result.error)}</p>` : ""}
  ${
    probabilities
      ? `<details class="probabilities"><summary>Returned route probabilities & argument decisions</summary>${Object.entries(
          probabilities,
        )
          .map(
            ([tool, value]) =>
              `<div class="probability"><span>${escape(tool)}</span><span>${pct(value)}</span></div>`,
          )
          .join(
            "",
          )}<pre class="arguments">${escape(json(result.rawResponse?.answers))}</pre></details>`
      : ""
  }</div></article>`;
}
function renderComparison(comparison = null) {
  current = comparison;
  const paired = comparison ? comparison.llm.status !== "skipped" : $("compare-llm").checked;
  $("execute-llm").hidden = !paired;
  $("router-grid").classList.toggle("single-router", !paired);
  $("router-grid").innerHTML = (paired ? ["llm", "jev"] : ["jev"])
    .map((r) => card(r, comparison?.[r], comparison?.correctness[r].tool))
    .join("");
  $("comparison-meta").innerHTML = comparison
    ? `<span>${comparison.llm.status === "skipped" ? "Jev-only routing" : comparison.sameTool == null ? "Agreement unavailable" : comparison.sameTool ? "✓ Same tool selected" : "↔ Different tools selected"}${comparison.sameTool ? (comparison.sameArguments ? " · arguments agree" : " · arguments differ") : ""}</span><span>Input ${escape(comparison.inputHash.slice(0, 10))}</span>`
    : "<span>Waiting for a request</span><span>No MCP calls made</span>";
  $("audit-output").textContent = comparison
    ? json({
        sharedState: comparison.sharedState,
        inputHash: comparison.inputHash,
        llmPayload: comparison.llm.providerPayload,
        jevPayload: comparison.jev.providerPayload,
        llmResponse: comparison.llm.rawResponse,
        jevResponse: comparison.jev.rawResponse,
      })
    : "Run a comparison to inspect its inputs.";
  executionControls();
}
function executionControls() {
  for (const r of ["llm", "jev"])
    $("execute-" + r).disabled =
      busy ||
      !current ||
      Boolean(current.execution) ||
      Boolean(current.batchId) ||
      current[r].status !== "ok" ||
      current[r].tool === "no_tool";
  $("execution-status").textContent = current?.execution
    ? `Execution ${current.execution.status} via ${current.execution.router.toUpperCase()}. Further calls are blocked.`
    : current?.batchId
      ? "Benchmark results are dry-run only. Start a live comparison to execute."
      : current
        ? "No MCP tool has been executed. Choose one valid route."
        : "Route your request, then execute a valid selection below.";
  $("execution-output").hidden = !current?.execution;
  $("execution-output").textContent = current?.execution
    ? json(current.execution.output ?? current.execution)
    : "";
}
function renderHistory() {
  $("history-list").innerHTML = history.length
    ? history
        .slice(0, 8)
        .map(
          (c) =>
            `<button class="history-item" data-id="${escape(c.id)}"><span>${escape(c.sharedState.userRequest)}</span><span>${c.batchId ? "Benchmark · " : ""}${c.llm.status === "skipped" ? "Jev only" : c.sameTool == null ? "Incomplete" : c.sameTool ? "Agreement" : "Disagreement"} · ${escape(new Date(c.createdAt).toLocaleTimeString())}</span></button>`,
        )
        .join("")
    : '<p class="small">No comparisons yet. Results will be saved locally.</p>';
  for (const button of $("history-list").querySelectorAll("button"))
    button.addEventListener("click", () => {
      const record = history.find((c) => c.id === button.dataset.id);
      $("request").value = record.sharedState.userRequest;
      $("expected").value = record.expectedTool || "";
      renderComparison(record);
      showView("compare");
    });
}
function renderDataset() {
  $("dataset-body").innerHTML = config.dataset
    .map((item, i) => {
      const result = batchResults.find((c) => c.caseId === item.id);
      return `<tr><td>${String(i + 1).padStart(2, "0")}</td><td>${escape(item.request)}<code>→ ${escape(item.expectedTool)}</code></td>${["llm", "jev"].map((r) => `<td>${!result ? '<span class="muted">Not run</span>' : `<span class="${result.correctness[r].tool ? "result-good" : "result-bad"}">${result.correctness[r].tool ? "✓ Correct" : result[r].status === "ok" ? "✕ Incorrect" : "Error"}</span><code>${escape(result[r].tool || result[r].error)}</code><code>${ms(result[r].routingLatencyMs)}</code>`}</td>`).join("")}<td>${result?.sameTool == null ? "—" : result.sameTool ? "Yes" : "No"}</td></tr>`;
    })
    .join("");
}
function summarizeBatch() {
  if (!batchResults.length) {
    $("benchmark-summary").innerHTML = "";
    return;
  }
  const pairs = batchResults.filter(
    (c) => c.llm.status === "ok" && c.jev.status === "ok",
  );
  const metrics = (r) => {
    const valid = batchResults.filter((c) => c[r].status === "ok");
    const times = valid
      .map((c) => c[r].routingLatencyMs)
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    return [
      pct(
        batchResults.filter((c) => c.correctness[r].tool).length /
          batchResults.length,
      ),
      pct(
        batchResults.filter((c) => c.correctness[r].arguments).length /
          batchResults.length,
      ),
      ms(times.length ? times.reduce((a, b) => a + b, 0) / times.length : null),
      ms(times.length ? times[Math.ceil(times.length * 0.95) - 1] : null),
      `${valid.length} / ${batchResults.length}`,
      "Unavailable",
    ];
  };
  const llm = metrics("llm"),
    jev = metrics("jev");
  $("benchmark-summary").innerHTML =
    `<div class="table-wrap"><table class="summary-table"><caption class="sr-only">Benchmark summary</caption><thead><tr><th>Metric</th><th>LLM</th><th>Jev</th></tr></thead><tbody>${["Tool accuracy", "Tool + argument accuracy", "Mean successful latency", "p95 successful latency", "Valid decisions / attempted", "Mean API cost"].map((label, i) => `<tr><td>${label}</td><td>${llm[i]}</td><td>${jev[i]}</td></tr>`).join("")}</tbody></table></div><p class="small summary-note">Tool agreement: ${pairs.length ? pct(pairs.filter((c) => c.sameTool).length / pairs.length) : "Unavailable"} across ${pairs.length} valid pairs. Accuracy includes errors as misses; latency excludes failed attempts. ${batchResults.length} of 20 cases completed.</p>`;
}

$("try-mcp-prompt").addEventListener("click", () => {
  if (busy || !config) return;
  const available = new Set(config.tools.map(tool => tool.name));
  const examples = config.dataset.filter(item => available.has(item.expectedTool) && item.request !== $("request").value.trim());
  if (!examples.length) return;
  const example = examples[Math.floor(Math.random() * examples.length)];
  $("request").value = example.request;
  $("expected").value = example.expectedTool;
  message();
  renderComparison();
  $("request").focus();
});
$("compare-llm").addEventListener("change", updateMode);
$("request-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  message();
  setBusy(true);
  renderComparison();
  $("comparison-meta").textContent =
    $("compare-llm").checked ? "Routing through both providers… No MCP tools are executing." : "Jev is selecting a tool… No MCP tools are executing.";
  try {
    const result = await api("/api/compare", {
      request: $("request").value,
      compareLlm: $("compare-llm").checked,
      expectedTool: $("expected").value || null,
    });
    history.unshift(result);
    renderComparison(result);
    renderHistory();
  } catch (error) {
    message(error.message);
    $("comparison-meta").textContent =
      "Comparison failed. No tool was executed.";
  } finally {
    setBusy(false);
  }
});
for (const router of ["llm", "jev"])
  $("execute-" + router).addEventListener("click", async () => {
    const comparison = current;
    message();
    setBusy(true);
    try {
      comparison.execution = await api("/api/execute", {
        comparisonId: comparison.id,
        router,
      });
    } catch (error) {
      message(error.message);
      // A lost response might follow a completed call. Refresh the durable claim,
      // never assume a network failure means the executor did not run.
      try {
        history = await api("/api/history");
        comparison.execution = history.find((c) => c.id === comparison.id)
          ?.execution ?? { status: "unknown", router };
      } catch {
        comparison.execution = { status: "unknown", router };
      }
    } finally {
      setBusy(false);
    }
  });
$("benchmark-button").addEventListener("click", async () => {
  message();
  setBusy(true);
  batchResults = [];
  renderDataset();
  summarizeBatch();
  $("benchmark-progress").textContent =
    "Running 0 / 20… Both routers are evaluated for each request.";
  try {
    const response = await fetch("/api/benchmark", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeaders() },
      body: "{}",
    });
    if (!response.ok) throw new Error((await response.json()).error);
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "",
      completed = false;
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "result") {
          batchResults.push(event.comparison);
          history.unshift(event.comparison);
          $("benchmark-progress").textContent =
            `Running ${event.completed} / ${event.total}… No tools are executing.`;
          renderDataset();
          summarizeBatch();
        }
        if (event.type === "done") {
          completed = true;
          $("benchmark-progress").textContent =
            `Completed ${batchResults.length} / 20 requests. Zero tool executions.`;
        }
      }
      if (done) break;
    }
    if (!completed)
      throw new Error(
        "Benchmark stream ended early. Completed results remain saved locally.",
      );
  } catch (error) {
    message(error.message);
    $("benchmark-progress").textContent =
      `Stopped after ${batchResults.length} / 20 cases. Completed results are saved.`;
  } finally {
    setBusy(false);
    renderHistory();
  }
});

try {
  [config, history] = await Promise.all([
    api("/api/config"),
    api("/api/history"),
  ]);
  const missing = Object.entries(config.routers)
    .filter(([, r]) => !r.configured)
    .map(([name]) =>
      name === "llm" ? "OPENROUTER_API_KEY" : "TYPESAFE_API_KEY",
    );
  $("setup").innerHTML = missing.length
    ? `<span><strong>Connect your providers</strong> · Add ${missing.map((name) => `<code>${name}</code>`).join(" and ")} in <a href="/">API key settings</a> or <code>.env</code>.</span><span>Missing metrics remain unavailable.</span>`
    : "<span><strong>Both providers configured</strong> · Ready for real routing requests.</span><span>Model calls may incur API charges.</span>";
  for (const tool of [...config.tools, { name: "no_tool" }]) {
    const option = document.createElement("option");
    option.value = tool.name;
    option.textContent = tool.name;
    $("expected").append(option);
  }
  $("catalog-tools").innerHTML = config.tools
    .map(
      (t, i) =>
        `<article class="tool-chip"><p class="tool-number">0${i + 1} / READ ONLY</p><strong>${escape(t.title || t.name)}</strong><p><code>${escape(t.name)}</code></p><details><summary>Description & schema</summary><p>${escape(t.description)}</p><p>${escape(json(t.inputSchema))}</p></details></article>`,
    )
    .join("");
  const latestBatch = history.find((c) => c.batchId)?.batchId;
  if (latestBatch) {
    batchResults = history.filter((c) => c.batchId === latestBatch).reverse();
    $("benchmark-progress").textContent =
      `Latest saved benchmark: ${batchResults.length} / 20 cases.`;
  }
  updateMode();
  if (history[0]) renderComparison(history[0]);
  renderHistory();
  renderDataset();
  summarizeBatch();
  setBusy(false);
} catch (error) {
  message(`Could not load the local server: ${error.message}`);
  $("compare-button").disabled = true;
  $("benchmark-button").disabled = true;
}
