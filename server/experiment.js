import { createHash, randomUUID } from 'node:crypto';
import { makeState, validateDecision } from './catalog.js';
import { DATASET_VERSION } from './dataset.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sameArguments = (a, b) => a && b ? a.service === b.service && a.environment === b.environment : false;

export class Experiment {
  locks = new Set();
  constructor({ mcp, routers, store }) { Object.assign(this, { mcp, routers, store }); }
  async compare({ request, expectedTool = null, expectedArguments = null, caseId = null, batchId = null, compareLlm = true }, keys = {}) {
    // Expectations are deliberately outside sharedState and both payloads.
    const state = makeState(request, structuredClone(this.mcp.tools));
    const [llm, jev] = await Promise.all([
      compareLlm ? this.routers.run('llm', structuredClone(state), keys) : Promise.resolve({ status: 'skipped', tool: null, arguments: null, routingLatencyMs: null, costUsd: null, error: null }), this.routers.run('jev', structuredClone(state), keys),
    ]);
    const bothValid = llm.status === 'ok' && jev.status === 'ok';
    const comparison = {
      id: randomUUID(), createdAt: new Date().toISOString(), sharedState: state, inputHash: digest(state), catalogHash: digest(state.tools),
      expectedTool, expectedArguments, caseId, batchId, datasetVersion: caseId ? DATASET_VERSION : null,
      llm, jev, compareLlm,
      sameTool: bothValid ? llm.tool === jev.tool : null,
      sameArguments: bothValid ? llm.tool === jev.tool && sameArguments(llm.arguments, jev.arguments) : null,
      correctness: Object.fromEntries([['llm', llm], ['jev', jev]].map(([id, r]) => [id, {
        tool: expectedTool === null ? null : r.status === 'ok' && r.tool === expectedTool,
        arguments: expectedArguments === null ? null : r.status === 'ok' && r.tool === expectedTool && sameArguments(r.arguments, expectedArguments),
      }])),
    };
    await this.store.append({ type: 'comparison', value: comparison });
    return comparison;
  }
  async execute(id, router) {
    const comparison = this.store.comparisons.get(id);
    if (!comparison) throw Object.assign(new Error('Comparison not found.'), { status: 404 });
    if (!['llm', 'jev'].includes(router)) throw Object.assign(new Error('Select llm or jev.'), { status: 400 });
    if (comparison.batchId) throw Object.assign(new Error('Benchmark comparisons are permanently dry-run.'), { status: 409 });
    if (this.locks.has(id) || this.store.executions.has(id)) throw Object.assign(new Error('This comparison already has an execution attempt. A second route cannot execute.'), { status: 409 });
    if (comparison[router].status !== 'ok' || comparison[router].tool === 'no_tool') throw Object.assign(new Error('This route is not executable.'), { status: 400 });
    if (digest(this.mcp.tools) !== comparison.catalogHash) throw Object.assign(new Error('Tool catalog changed. Create a new comparison.'), { status: 409 });
    const decision = validateDecision(comparison[router], this.mcp.tools);
    this.locks.add(id); // Synchronous reservation before the first await.
    const claim = { router, tool: decision.tool, arguments: decision.arguments, status: 'claimed', claimedAt: new Date().toISOString() };
    try {
      await this.store.append({ type: 'execution', id, value: claim });
      let outcome;
      try {
        const output = await this.mcp.callTool({ name: decision.tool, arguments: decision.arguments });
        outcome = { ...claim, status: output.isError ? 'failed' : 'completed', output };
      } catch (error) { outcome = { ...claim, status: 'failed', error: error.message }; }
      outcome.finishedAt = new Date().toISOString();
      await this.store.append({ type: 'execution', id, value: outcome });
      return outcome;
    } finally { this.locks.delete(id); }
  }
}

export function summarize(comparisons) {
  const paired = comparisons.filter(c => c.llm.status === 'ok' && c.jev.status === 'ok');
  const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return {
    count: comparisons.length, pairedCount: paired.length,
    agreement: paired.length ? paired.filter(c => c.sameTool).length / paired.length : null,
    ...Object.fromEntries(['llm', 'jev'].map(router => {
      const labelled = comparisons.filter(c => c.expectedTool !== null);
      const valid = comparisons.filter(c => c[router].status === 'ok');
      const latencies = valid.map(c => c[router].routingLatencyMs).filter(v => v !== null).sort((a, b) => a - b);
      const costs = comparisons.map(c => c[router].costUsd).filter(v => v !== null);
      return [router, {
        successCount: valid.length, errorCount: comparisons.length - valid.length,
        accuracy: labelled.length ? labelled.filter(c => c.correctness[router].tool).length / labelled.length : null,
        argumentAccuracy: labelled.length ? labelled.filter(c => c.correctness[router].arguments).length / labelled.length : null,
        latencySamples: latencies.length, meanLatencyMs: mean(latencies),
        p95LatencyMs: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null,
        meanCostUsd: mean(costs), costSamples: costs.length,
      }];
    })),
  };
}
