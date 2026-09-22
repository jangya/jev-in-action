import './navigation.js';
import { keyHeaders, readKeys } from './credentials.js';
import { runBenchmark, summarizeBenchmark } from './tool-selection-benchmark.js';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = value => JSON.stringify(value, null, 2);
const number = value => value == null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const usd = value => value == null ? 'Unavailable' : `$${value.toFixed(8)}`;
const pct = value => value == null ? 'Not labeled' : `${(value * 100).toFixed(1)}%`;
let config, results = {}, history = [], benchmarkResults = [], busy = false, stop = false;
function message(text = '') { $('message').textContent = text; $('message').hidden = !text; }
function setBusy(value, benchmarking = false) {
  busy = value;
  document.querySelectorAll('#request-form input, #request-form textarea, #request-form select, #request-form button, #benchmark').forEach(node => { node.disabled = value || !config; });
  $('stop').disabled = !value || !benchmarking;
}
async function api(path, body, headers = keyHeaders(), onProgress = () => {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), body ? 55000 : 15000);
  try {
    const response = await fetch(path, { signal: controller.signal, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    if (response.ok && response.headers.get('content-type')?.includes('application/x-ndjson')) {
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '', result;
      const consume = line => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === 'progress') onProgress(event.stage);
        if (event.type === 'result') result = event.result;
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let end;
        while ((end = buffer.indexOf('\n')) !== -1) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
        if (done) break;
      }
      consume(buffer);
      if (!result) throw new Error('The server connection ended before a result arrived. Check the server terminal and try again.');
      return result;
    }
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`The experiment API returned an unexpected response (HTTP ${response.status}). Restart the app server with npm run dev, then reload this page. If hosted, deploy the updated server together with the page.`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The server did not finish before the request deadline. The request was cancelled. Check the server terminal or try another model.');
    throw error;
  } finally { clearTimeout(timeout); }
}

function card(mode) {
  const r = results[mode];
  const title = mode === 'standard' ? 'Standard LLM' : 'Jev Router';
  if (!r) return `<article class="card result-card"><div class="card-heading"><h3>${title}</h3><span class="pill neutral">Ready</span></div><p class="small empty-result">${mode === 'standard' ? 'All tools · one LLM call' : 'Selected tool · two LLM calls + Jev'}</p></article>`;
  const fields = [
    ['Status', r.status === 'ok' ? (r.output ? 'Mock executed' : 'No tool executed') : 'Failed'],
    ['Selected tool', r.tool ?? 'None'], ['LLM input tokens', number(r.llm.inputTokens)], ['LLM output tokens', number(r.llm.outputTokens)],
    ['Total LLM tokens', number(r.llm.totalTokens)], ['LLM cost (provider USD)', usd(r.llm.costUsd)],
    ['Routing confidence', mode === 'jev' ? (r.jev?.confidence == null ? 'Unavailable' : pct(r.jev.confidence)) : 'Not exposed'],
    ['Total latency', `${number(r.latencyMs)} ms`], ['Correct tool', r.correctTool == null ? 'Not labeled' : r.correctTool ? 'Yes' : 'No'],
  ];
  if (mode === 'jev') fields.push(['Jev routing latency', r.jev ? `${number(r.jev.latencyMs)} ms` : 'Not called'], ['Jev total tokens', !r.jev ? 'Not called' : r.jev.metrics.totalTokens == null ? 'JEV token usage not exposed' : number(r.jev.metrics.totalTokens)], ['Jev cost (separate)', r.jev ? usd(r.jev.metrics.costUsd) : 'Not called']);
  const secondary = fields.filter(([label]) => !['Status', 'Selected tool', 'Total LLM tokens', 'Total latency'].includes(label));
  return `<article class="card result-card"><div class="card-heading"><h3>${title}</h3><span class="pill ${r.status === 'ok' ? 'result-ok' : 'result-error'}">${r.status === 'ok' ? r.output ? 'Executed' : 'No match' : 'Failed'}</span></div><p class="selected-tool">${escape(r.tool ?? 'No tool selected')}</p><div class="metrics"><div><strong>${number(r.llm.inputTokens)}</strong><span>LLM input</span></div><div><strong>${number(r.llm.totalTokens)}</strong><span>LLM total</span></div><div><strong>${(r.latencyMs / 1000).toFixed(2)}s</strong><span>Total time</span></div></div>${r.error ? `<p class="error result-error-message" role="alert">${escape(r.error)}</p>` : ''}<details class="result-details"><summary>Run details</summary><p class="small">${escape(r.requestedModel)} · ${r.llmCalls.length} LLM call(s)</p><dl>${secondary.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('')}</dl></details></article>`;

}
function render() {
  $('router-grid').innerHTML = card('standard') + card('jev');
  $('context').textContent = Object.keys(results).length ? json(results) : 'No requests yet.';
  const a = results.standard, b = results.jev;
  const models = r => r.llmCalls.map(call => call.rawResponse?.model);
  const comparable = a && b && a.status === 'ok' && b.status === 'ok' && a.prompt === b.prompt && a.size === b.size && a.requestedModel === b.requestedModel && models(a).every(model => model && models(b).every(other => other === model));
  const parts = [];
  if (a && b) parts.push(`Routing result: ${a.tool && b.tool ? (a.tool === b.tool ? 'SAME' : 'DIFFERENT') : 'Unavailable'}`);
  if (comparable && a.llm.totalTokens > 0 && b.llm.totalTokens !== null) parts.push(`LLM tokens saved: ${((1 - b.llm.totalTokens / a.llm.totalTokens) * 100).toFixed(1)}%`);
  else parts.push('Run both successfully with the same model to compare.');
  if (comparable && a.llm.costUsd !== null && b.llm.costUsd !== null && a.llm.costUsd !== b.llm.costUsd) parts.push(`LLM cost saved: ${usd(a.llm.costUsd - b.llm.costUsd)} (Jev cost excluded)`);
  $('comparison-meta').textContent = parts.join(' · ');
}
async function registry() {
  const size = Number($('size').value);
  const data = await api(`/api/tool-selection/registry?size=${size}`);
  if (Number($('size').value) === size) $('registry').textContent = json(data);
}
function expectedCase(prompt) { return config.cases.find(item => item.prompt === prompt); }
function headers() { return { ...keyHeaders(), 'x-llm-model': $('model').value.trim() }; }
async function run(params, frozenHeaders) {
  const start = performance.now();
  let stage = 'Connecting to app server';
  const status = () => { $('comparison-meta').textContent = `${params.mode === 'standard' ? 'Standard' : 'Jev Router'} · ${stage} · ${Math.floor((performance.now() - start) / 1000)}s elapsed (50s server limit)`; };
  status();
  const timer = setInterval(status, 1000);
  try {
    const result = await api('/api/tool-selection/run', { ...params, stream: true }, frozenHeaders, value => { stage = value; status(); });
    history.push(result);
    return result;
  } finally { clearInterval(timer); }
}

$('request-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !config) return;
  const mode = event.submitter?.dataset.mode || 'both';
  const prompt = $('request').value.trim(), size = Number($('size').value), item = expectedCase(prompt);
  const frozenHeaders = headers();
  message(); setBusy(true);
  if (mode === 'both') results = {};
  else delete results[mode];
  render();
  try {
    for (const current of mode === 'both' ? ['standard', 'jev'] : [mode]) {
      results[current] = await run({ mode: current, prompt, size, ...(item ? { caseId: item.id } : {}) }, frozenHeaders);
      render();
    }
  } catch (error) { message(error.message); }
  finally { setBusy(false); render(); }
});
$('example').addEventListener('click', () => {
  if (busy || !config?.cases?.length) return;
  const candidates = config.cases.filter(item => item.prompt !== $('request').value.trim());
  if (!candidates.length) return;
  $('request').value = candidates[Math.floor(Math.random() * candidates.length)].prompt;
  message(); results = {}; render();
});
for (const id of ['request', 'size', 'model']) $(id).addEventListener('input', () => {
  results = {}; render();
});
$('size').addEventListener('change', () => registry().catch(error => message(error.message)));
function renderBenchmark() {
  const average = (metric, format = number) => `${format(metric.value)} (n=${metric.samples})`;
  $('benchmark-results').innerHTML = summarizeBenchmark(benchmarkResults, config.sizes).map(row => `<tr>${[
    row.size, row.mode === 'standard' ? 'Standard' : 'Jev', row.count, row.count ? pct(row.accuracy) : '—', row.successes,
    average(row.input), average(row.total), average(row.latency) + ' ms', average(row.cost, usd), row.mode === 'jev' ? average(row.jevTokens) : '—', row.mode === 'jev' ? average(row.jevCost, usd) : '—',
  ].map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('');
  $('benchmark-log').textContent = json(benchmarkResults.map(({ size, mode, prompt, expectedTool, tool, correctTool, status, error }) => ({ size, mode, prompt, expectedTool, tool, correctTool, status, error })));
}
$('benchmark').addEventListener('click', async () => {
  if (busy || !config || !$('model').reportValidity()) return;
  const frozenHeaders = headers();
  if ((!config.routers.llm.configured && !frozenHeaders['x-llm-key']) || (!config.routers.jev.configured && !frozenHeaders['x-jev-key'])) return message('Configure both provider keys before running the benchmark.');
  stop = false; benchmarkResults = []; message(); setBusy(true, true); renderBenchmark();
  $('progress').textContent = 'Starting 100 mode runs…';
  try {
    await runBenchmark({ sizes: config.sizes, cases: config.cases, run: params => run(params, frozenHeaders), stopped: () => stop,
      onResult: rows => { benchmarkResults = [...rows]; renderBenchmark(); $('progress').textContent = `Completed ${rows.length} / 100 mode runs.`; },
    });
    $('progress').textContent = `${stop ? 'Stopped' : 'Completed'}: ${benchmarkResults.length} / 100 mode runs. Export includes all requests and responses.`;
  } catch (error) { message(error.message); $('progress').textContent = `Interrupted after ${benchmarkResults.length} / 100 mode runs; partial results preserved.`; }
  finally { setBusy(false); render(); }
});
$('stop').addEventListener('click', () => { stop = true; $('stop').disabled = true; $('progress').textContent = 'Stopping after the current mode run…'; });
$('export').addEventListener('click', () => {
  const blob = new Blob([json({ version: 'enterprise-routing-v1', exportedAt: new Date().toISOString(), cases: config?.cases, history, benchmark: { results: benchmarkResults, summary: config ? summarizeBenchmark(benchmarkResults, config.sizes) : [] } })], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'tool-selection-experiment.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
setBusy(false); render();
try {
  config = await api('/api/tool-selection/config');
  $('model').value = readKeys().llmModel || config.routers.llm.model;
  $('provider-status').textContent = `OpenRouter: ${config.routers.llm.configured ? 'ready' : 'add key'} · Jev: ${config.routers.jev.configured ? 'ready' : 'add key'}.`;
  await registry(); setBusy(false);
} catch (error) { message(error.message); }
