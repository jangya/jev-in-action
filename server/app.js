import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { dataset, DATASET_VERSION } from './dataset.js';
import { summarize } from './experiment.js';
import { demoInput, runDemo } from './demo.js';

export function createApp(experiment) {
  const app = express();
  const { store, routers, mcp } = experiment;
  let routing = false;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    // Local single-user prototype: bind loopback and reject cross-origin writes.
    const hostname = req.hostname;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return res.status(403).json({ error: 'Local access only.' });
    if (req.method === 'POST') {
      if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
      if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.headers.host}`) return res.status(403).json({ error: 'Cross-origin requests are disabled.' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  const keysFor = req => ({ jev: z.string().max(4096).optional().parse(req.get('x-jev-key')), llm: z.string().max(4096).optional().parse(req.get('x-llm-key')), llmModel: z.string().min(1).max(200).regex(/^[a-zA-Z0-9._:/-]+$/).optional().parse(req.get('x-llm-model')) });
  const statusFor = req => Object.fromEntries(Object.entries(routers.status).map(([id, value]) => [id, { ...value, model: id === 'llm' ? keysFor(req).llmModel || value.model : value.model, configured: value.configured || Boolean(keysFor(req)[id]) }]));
  app.post('/api/demo', async (req, res) => res.json(await runDemo(demoInput.parse(req.body), routers, keysFor(req).jev)));
  app.get('/api/config', (req, res) => res.json({ routers: statusFor(req), tools: mcp.tools, dataset, datasetVersion: DATASET_VERSION, dataSource: 'Static demo fixtures', routing }));
  app.get('/api/history', (_req, res) => res.json([...store.comparisons.values()].reverse().map(c => ({ ...c, execution: store.executions.get(c.id) ?? null }))));
  const input = z.object({ request: z.string().min(1).max(4000).refine(s => s.trim().length > 0),
    compareLlm: z.boolean().default(false),
    expectedTool: z.enum([...mcp.tools.map(t => t.name), 'no_tool']).nullable().optional() }).strict();
  app.post('/api/compare', async (req, res) => {
    const params = input.parse(req.body);
    if (routing) return res.status(409).json({ error: 'A comparison or benchmark is already running.' });
    routing = true;
    try { res.json(await experiment.compare(params, keysFor(req))); }
    finally { routing = false; }
  });
  app.post('/api/benchmark', async (req, res) => {
    if (routing) return res.status(409).json({ error: 'A comparison or benchmark is already running.' });
    if (!statusFor(req).llm.configured || !statusFor(req).jev.configured) return res.status(400).json({ error: 'Configure both API keys before running the benchmark.' });
    routing = true;
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const batchId = randomUUID();
    const results = [];
    let disconnected = false;
    res.on('close', () => { disconnected = true; });
    try {
      for (const item of dataset) {
        if (disconnected) break;
        const comparison = await experiment.compare({ ...item, caseId: item.id, batchId }, keysFor(req));
        results.push(comparison);
        if (!disconnected) res.write(JSON.stringify({ type: 'result', comparison, completed: results.length, total: dataset.length }) + '\n');
      }
      if (!disconnected) res.end(JSON.stringify({ type: 'done', batchId, summary: summarize(results) }) + '\n');
    } catch (error) {
      if (!disconnected) res.end(JSON.stringify({ type: 'error', error: error.message }) + '\n');
    } finally { routing = false; }
  });
  app.post('/api/execute', async (req, res) => {
    const { comparisonId, router } = z.object({ comparisonId: z.string().uuid(), router: z.enum(['llm', 'jev']) }).strict().parse(req.body);
    res.json(await experiment.execute(comparisonId, router));
  });
  app.get('/api/export', (_req, res) => res.attachment('route-lab-results.json').json({
    exportedAt: new Date().toISOString(), datasetVersion: DATASET_VERSION, dataset,
    comparisons: [...store.comparisons.values()], executions: Object.fromEntries(store.executions),
    benchmarkSummaries: [...new Set([...store.comparisons.values()].map(c => c.batchId).filter(Boolean))].map(batchId => ({
      batchId, ...summarize([...store.comparisons.values()].filter(c => c.batchId === batchId)),
    })),
  }));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    res.status(error instanceof z.ZodError ? 400 : error.status || 500).json({ error: error instanceof z.ZodError ? 'Invalid request: ' + error.issues.map(i => i.message).join('; ') : error.message });
  });
  return app;
}
