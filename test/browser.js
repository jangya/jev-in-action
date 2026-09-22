import { selectionFixture } from './tool-selection-fixtures.js';
import assert from "node:assert/strict";
import { once } from "node:events";
import { access, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { connectMcp } from "../server/mcp-client.js";
import { createRouters } from "../server/routers.js";
import { Store } from "../server/store.js";
import { Experiment } from "../server/experiment.js";
import { createApp } from "../server/app.js";
import { dataset } from "../server/dataset.js";

const directory = await mkdtemp(join(tmpdir(), "route-lab-browser-"));
await mkdir("test-artifacts", { recursive: true });
const mcp = await connectMcp();
let llmCalls = 0;
let calls = 0,
  errorMode = false;
const instrumented = {
  tools: mcp.tools,
  callTool: async (args) => {
    calls++;
    return mcp.callTool(args);
  },
};
const testFetch = async (url, options) => {
  if (!url.includes("typesafe")) llmCalls++;
  const payload = JSON.parse(options.body);
  const fixture = selectionFixture(payload);
  if (fixture) return errorMode && url.includes('typesafe') ? new Response('{}', { status: 429 }) : fixture;
  const state = payload.state || JSON.parse(payload.messages[1].content);
  if (payload.questions && !payload.questions.route) {
    if (errorMode) return new Response('{}', { status: 429 });
    return new Response(JSON.stringify({ model: 'TEST-FIXTURE-JEV', answers: Object.fromEntries(Object.entries(payload.questions).map(([id, q]) => [id, { type: 'choice', choice: id === 'selection' ? Object.keys(q.criteria).find(key => key === 'slot5') || Object.keys(q.criteria)[0] : 'Travel', confidence: 0.8 }])), usage: { input_tokens: 100, output_tokens: 10 } }));
  }
  const item =
    dataset.find((row) => row.request === state.userRequest) || dataset[0];
  if (errorMode && url.includes("typesafe"))
    return new Response("{}", { status: 429 });
  // Synthetic data exists only in this isolated test app, never production.
  return new Response(
    JSON.stringify(
      url.includes("typesafe")
        ? {
            model: "TEST-FIXTURE-JEV",
            answers: {
              route: {
                type: "choice",
                choice: item.expectedTool,
                confidence: 0.81,
                probabilities: { [item.expectedTool]: 0.92, no_tool: 0.08 },
              },
              service: {
                type: "choice",
                choice: item.expectedArguments.service,
              },
              environment: {
                type: "choice",
                choice: item.expectedArguments.environment,
              },
            },
            usage: { input_tokens: 88, output_tokens: 12 },
          }
        : {
            model: "TEST-FIXTURE-LLM",
            choices: [
              {
                message: {
                  role: "assistant",
                  tool_calls: [
                    {
                      type: "function",
                      function: {
                        name: item.expectedTool,
                        arguments: JSON.stringify(item.expectedArguments),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { input_tokens: 111, output_tokens: 17 },
          },
    ),
  );
};
const routers = createRouters(
  { OPENROUTER_API_KEY: "test-only", TYPESAFE_API_KEY: "test-only" },
  testFetch,
);
const store = await new Store(join(directory, "events.jsonl")).init();
const experiment = new Experiment({ mcp: instrumented, routers, store });
const server = createApp(experiment).listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const executablePath =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  let options = { headless: true };
  try {
    await access(executablePath);
    options.executablePath = executablePath;
  } catch {
    /* Use Playwright Chromium. */
  }
  browser = await chromium.launch(options);
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) errors.push(msg.text());
  });
  await page.goto(base);
  await page.getByRole('heading', { name: 'Less sorting. More clarity.' }).waitFor();
  await page.getByRole('link', { name: 'Star Jev in Action on GitHub' }).waitFor();
  await page.screenshot({ path: 'test-artifacts/playground-overview.png', fullPage: true });
  const sidebarBox = await page.locator('#use-case-sidebar').boundingBox();
  const workspaceBox = await page.locator('#main-content').boundingBox();
  assert.ok(sidebarBox.x + sidebarBox.width <= workspaceBox.x);
  assert.ok(workspaceBox.y < 160, 'Workspace starts near the top without a hero');
  await page.setViewportSize({ width: 375, height: 812 });
  const navigationToggle = page.getByRole('button', { name: 'Use cases', exact: true });
  assert.equal(await page.locator('#use-case-list').isVisible(), false);
  await navigationToggle.click();
  await page.getByRole('button', { name: 'Book a flight', exact: true }).click();
  assert.equal(await navigationToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#main-content').evaluate(el => el === document.activeElement), true);
  await navigationToggle.click();
  await page.keyboard.press('Escape');
  assert.equal(await navigationToggle.getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: 'test-artifacts/playground-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Categorize expenses', exact: true }).click();

  const originalPrompt = await page.locator('#goal').inputValue();
  await page.getByRole('button', { name: 'Try another prompt' }).click();
  assert.notEqual(await page.locator('#goal').inputValue(), originalPrompt);

  await page.getByRole('button', { name: 'Key configured' }).click();
  await page.locator('#jev-key').fill('test-browser-key');
  await page.locator('#llm-model').fill('test/model');
  await page.getByRole('button', { name: 'Save keys' }).click();
  assert.ok(await page.evaluate(() => sessionStorage.getItem('jev-playground-keys')));
  assert.equal(await page.evaluate(() => localStorage.getItem('jev-playground-keys')), null);
  await page.reload();
  await page.getByRole('button', { name: 'Book a flight', exact: true }).click();
  await page.getByRole('button', { name: 'Find my flight' }).click();
  await page.getByRole('button', { name: 'Confirm demo booking' }).waitFor();
  assert.equal(await page.locator('.flight.selected').count(), 1);
  await page.locator('#result-summary').waitFor();
  const sent = JSON.parse(await page.locator('#model-input').textContent());
  assert.equal(sent.model, 'jev-latest');
  assert.equal(sent.state.kind, 'flight');
  assert.ok(sent.questions.selection);
  assert.equal(JSON.parse(await page.locator('#model-output').textContent()).model, 'TEST-FIXTURE-JEV');
  assert.ok(!(await page.locator('#model-input').textContent()).includes('test-browser-key'));

  await page.getByRole('button', { name: 'Confirm demo booking' }).click();
  await page.getByRole('heading', { name: 'Demo booking confirmed' }).waitFor();
  await page.screenshot({ path: 'test-artifacts/playground-flight.png', fullPage: true });
  await page.locator('#budget').fill('1');
  assert.equal(await page.locator('#selection').isHidden(), true);
  await page.getByRole('button', { name: 'Find my flight' }).click();
  await page.getByText('No matching availability', { exact: true }).waitFor();
  assert.equal(await page.locator('#calls').textContent(), '0');
  await page.getByRole('button', { name: 'Book an appointment' }).click();
  await page.getByRole('button', { name: 'Find a time' }).click();
  await page.getByRole('button', { name: 'Confirm demo booking' }).waitFor();
  assert.equal(await page.locator('.slot.selected').count(), 1);
  assert.equal(await page.locator('#summary-label').textContent(), 'SELECTED APPOINTMENT');
  assert.equal(JSON.parse(await page.locator('#model-input').textContent()).state.kind, 'appointment');
  await page.screenshot({ path: 'test-artifacts/playground-appointment.png', fullPage: true });
  await page.locator('#service').selectOption('consultation');
  assert.equal(await page.locator('#selection').isHidden(), true);
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.locator('#calendar button').first().click();
  await page.getByRole('button', { name: 'Find a time' }).click();
  await page.getByRole('button', { name: 'Confirm demo booking' }).waitFor();
  await page.getByRole('button', { name: 'Categorize expenses', exact: true }).click();
  await page.locator('[data-field="description"]').first().fill('Airport taxi');
  await page.getByRole('button', { name: 'Add row' }).click();
  await page.locator('[data-field="description"]').last().fill('Bus pass');
  await page.locator('#run').click();
  await page.getByText('Batch decisions returned', { exact: true }).waitFor();
  assert.equal(await page.locator('.category').count(), 9);
  assert.equal(await page.locator('#summary-title').textContent(), '9 transactions categorized');
  assert.equal(Object.keys(JSON.parse(await page.locator('#model-input').textContent()).questions).length, 9);
  assert.equal(await page.locator('#calls').textContent(), '1');
  await page.screenshot({ path: 'test-artifacts/playground-expenses.png', fullPage: true });
  errorMode = true;
  await page.locator('#run').click();
  await page.locator('#error').waitFor();
  assert.match(await page.locator('#error').textContent(), /429/);
  assert.equal(await page.locator('.category').count(), 0);
  errorMode = false;
  // Expected HTTP 502 from the explicit error test may be logged by Chrome.
  errors.length = 0;
  for (const view of ['flight', 'appointment', 'expenses']) {
    await page.locator(`[data-view="${view}"]`).click();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${view} overflow at ${width}`);
    }
  }
  await page.getByRole('button', { name: 'Key configured' }).click();
  await page.locator('#remember').check();
  await page.getByRole('button', { name: 'Save keys' }).click();
  assert.ok(await page.evaluate(() => localStorage.getItem('jev-playground-keys')));
  assert.equal(await page.evaluate(() => sessionStorage.getItem('jev-playground-keys')), null);
  await page.getByRole('button', { name: 'Key configured' }).click();
  assert.equal(await page.locator('#llm-model').inputValue(), 'test/model');
  await page.getByRole('button', { name: 'Clear saved keys' }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('jev-playground-keys')), null);
  await page.getByRole('button', { name: 'Close API settings' }).click();
  await page.goto(base + '/compare.html');
  await page.locator('#open-keys').click();
  await page.locator('#key-dialog').waitFor({ state: 'visible' });
  assert.ok(page.url().endsWith('/compare.html'));
  await page.locator('#jev-key').fill('comparison-fixture-key');
  await page.locator('#llm-key').fill('comparison-fixture-llm');
  await page.locator('#llm-model').fill('test/model');
  await page.getByRole('button', { name: 'Save keys', exact: true }).click();
  await page.locator('#key-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#model').inputValue(), 'test/model');
  assert.equal(await page.locator('#jev-key').inputValue(), '');
  assert.ok(page.url().endsWith('/compare.html'));
  await page.getByRole('button', { name: 'Run Both', exact: true }).click();
  await page.locator('#comparison-meta').filter({ hasText: 'Routing result: SAME' }).waitFor();
  assert.equal(await page.locator('#router-grid article').count(), 2);
  const context = JSON.parse(await page.locator('#context').textContent());
  assert.equal(context.standard.llmCalls[0].providerPayload.tools.length, 25);
  assert.equal(context.jev.llmCalls.length, 2);
  assert.equal(context.jev.llmCalls[0].providerPayload.tools[0].function.name, 'route');
  assert.equal(context.jev.llmCalls[1].providerPayload.tools.length, 1);
  assert.equal(context.jev.output.mocked, true);
  assert.equal(calls, 0);
  await page.screenshot({ path: 'test-artifacts/comparison-test-fixtures.png', fullPage: true });
  await page.locator('#benchmark-panel > summary').click();
  await page.getByRole('button', { name: 'Run Benchmark', exact: true }).click();
  await page.locator('#progress').filter({ hasText: 'Completed: 100 / 100' }).waitFor();
  assert.equal(await page.locator('#benchmark-results tr').count(), 10);
  assert.equal(calls, 0);
  const crossOrigin = await page.request.post(base + '/api/tool-selection/run', { data: {}, headers: { Origin: 'https://untrusted.example' } });
  assert.equal(crossOrigin.status(), 403);
  const invalid = await page.request.post(base + '/api/tool-selection/run', { data: { prompt: '   ', size: 25, mode: 'jev' } });
  assert.equal(invalid.status(), 400);
  errorMode = true;
  await page.getByRole('button', { name: 'Run JEV Router', exact: true }).click();
  await page.locator('#router-grid').getByText('Failed', { exact: true }).waitFor();
  assert.equal(calls, 0);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    assert.equal(overflow, false, `Horizontal page overflow at ${width}px`);
  }
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => document.activeElement !== document.body),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: progressive disclosure, comparison, metrics, 100-run benchmark, provider errors, cross-origin rejection, keyboard focus, four viewport sizes, zero console errors. Provider responses were test fixtures.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await mcp.close();
}
