import { selectionFixture } from './tool-selection-fixtures.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import { chromium } from '@playwright/test';
import { createApp } from '../server/app.js';
import { connectHostedMcp } from '../server/mcp-client.js';
import { createRouters } from '../server/routers.js';
import { dataset } from '../server/dataset.js';

const directory = await mkdtemp(join(tmpdir(), 'jev-hosted-test-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const tls = { key: await readFile(join(directory, 'key.pem')), cert: await readFile(join(directory, 'cert.pem')) };
const mcp = await connectHostedMcp();
let calls = 0;
const providerKeys = [];
const testFetch = async (url, options) => {
  providerKeys.push(options.headers.Authorization);
  const p = JSON.parse(options.body);
  const fixture = selectionFixture(p);
  if (fixture) return fixture;
  const state = p.state || JSON.parse(p.messages[1].content);
  const row = dataset.find(item => item.request === state.userRequest) || dataset[0];
  if (url.includes('typesafe')) {
    const answers = p.questions.route ? {
      route: { type: 'choice', choice: row.expectedTool },
      service: { type: 'choice', choice: row.expectedArguments.service },
      environment: { type: 'choice', choice: row.expectedArguments.environment },
    } : Object.fromEntries(Object.keys(p.questions).map(id => [id, { type: 'choice', choice: id === 'selection' ? state.candidates[0].id : 'Other' }]));
    return Response.json({ model: 'test-jev', answers });
  }
  return Response.json({ model: 'test-llm', choices: [{ message: { tool_calls: [{ type: 'function', function: { name: row.expectedTool, arguments: JSON.stringify(row.expectedArguments) } }] } }] });
};
// Any attempt to use a shared journal fails the test.
const store = new Proxy({}, { get() { throw Error('Hosted handler touched shared storage'); } });
const app = createApp({ store, routers: createRouters({}, testFetch), mcp: { tools: mcp.tools, callTool: async args => { calls++; return mcp.callTool(args); } } }, { hosted: true });
const server = https.createServer(tls, app).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `https://localhost:${server.address().port}`;
let browser, rootServer;
try {
  const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const options = { headless: true };
  try { await access(executablePath); options.executablePath = executablePath; } catch {}
  browser = await chromium.launch(options);
  const a = await browser.newContext({ ignoreHTTPSErrors: true });
  const b = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await a.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Add API key' }).click();
  await page.locator('#jev-key').fill('visitor-a');
  await page.locator('#llm-key').fill('visitor-a-llm');
  await page.getByRole('button', { name: 'Save keys' }).click();
  await page.locator('#run').click();
  await page.getByText('Batch decisions returned', { exact: true }).waitFor();
  assert.equal(await page.locator('.category').count(), 8);
  await page.getByRole('button', { name: 'Book a flight', exact: true }).click();
  await page.locator('#run').click();
  await page.getByRole('button', { name: 'Confirm demo booking' }).waitFor();
  await page.getByRole('button', { name: 'Book an appointment', exact: true }).click();
  await page.locator('#run').click();
  await page.getByRole('button', { name: 'Confirm demo booking' }).waitFor();
  await page.goto(base + '/compare.html');
  await page.getByRole('button', { name: 'Run Both', exact: true }).click();
  await page.locator('#comparison-meta').filter({ hasText: 'Routing result: SAME' }).waitFor();
  assert.equal(calls, 0);
  const other = await b.newPage();
  await other.goto(base + '/compare.html');
  assert.equal(await other.locator('#context').textContent(), 'No requests yet.');
  const config = await (await b.request.get(base + '/api/tool-selection/config')).json();
  assert.equal(config.routers.jev.configured, false);
  assert.equal(config.hosted, true);
  await page.locator('#benchmark-panel > summary').click();
  await page.getByRole('button', { name: 'Run Benchmark', exact: true }).click();
  await page.locator('#progress').filter({ hasText: 'Completed: 100 / 100' }).waitFor();
  assert.equal(calls, 0);
  assert.equal(await page.locator('#benchmark-results tr').count(), 10);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.history.length, 102);
  assert.ok(!JSON.stringify(exported).includes('visitor-a'));
  assert.ok(providerKeys.every(key => key === 'Bearer visitor-a' || key === 'Bearer visitor-a-llm'));
  assert.equal((await b.request.post(base + '/api/tool-selection/run', { headers: { Origin: 'https://other.example' }, data: {} })).status(), 403);
  // Root entry point initializes without disk or deployment-key fallback.
  process.env.TYPESAFE_API_KEY = 'deployment-key-must-not-be-used';
  const { default: root } = await import('../app.js');
  rootServer = https.createServer(tls, root).listen(0, '127.0.0.1');
  await once(rootServer, 'listening');
  const rootBase = `https://localhost:${rootServer.address().port}`;
  const rootConfig = await (await a.request.get(rootBase + '/api/config')).json();
  assert.equal(rootConfig.routers.jev.configured, false);
  assert.equal(rootConfig.tools.length, 5);
  assert.deepEqual(errors, []);
  console.log('Hosted checks passed: root entry point, BYOK isolation, all demos, mock execution, session isolation, per-mode benchmark, export, and origin checks. Synthetic provider responses only.');
} finally {
  await browser?.close();
  if (rootServer) await new Promise(resolve => rootServer.close(resolve));
  await new Promise(resolve => server.close(resolve));
  await mcp.close();
  await rm(directory, { recursive: true, force: true });
}
