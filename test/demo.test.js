import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouters } from '../server/routers.js';
import { demoInput, runDemo } from '../server/demo.js';
import { transactions } from '../public/demo-data.js';
const flight = { kind: 'flight', goal: 'Cheapest flight', date: '2026-10-01', budget: 15000, latest: '22:00', stops: 1 };
test('demo choice payload contains only eligible candidates; browser key stays out of payload and results', async () => {
  const routers = createRouters({}, async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer browser-secret');
    assert.ok(!options.body.includes('browser-secret'));
    const p = JSON.parse(options.body);
    assert.deepEqual(p.state.candidates.map(f => f.id), ['6E204', 'QP142']);
    assert.ok(p.questions.selection.criteria.no_match);
    return Response.json({ answers: { selection: { type: 'choice', choice: 'QP142' } } });
  });
  const result = await runDemo(flight, routers, 'browser-secret');
  assert.equal(result.selected.id, 'QP142');
  assert.equal(result.calls, 1);
  assert.ok(!JSON.stringify(result).includes('browser-secret'));
});
test('no availability skips inference; no_match and invalid output never select a booking', async () => {
  const noCalls = { decide: () => { throw Error('Should not call provider'); } };
  assert.equal((await runDemo({ ...flight, budget: 1 }, noCalls)).calls, 0);
  for (const choice of ['no_match', 'AI806', 'unknown']) {
    const routers = createRouters({ TYPESAFE_API_KEY: 'test' }, async () => Response.json({ answers: { selection: { type: 'choice', choice } } }));
    if (choice === 'no_match') assert.equal((await runDemo(flight, routers)).selected, null);
    else await assert.rejects(runDemo(flight, routers), /invalid decision/);
  }
});
test('appointments exclude booked slots and preserve requested service/date', async () => {
  const routers = createRouters({ TYPESAFE_API_KEY: 'test' }, async (_url, options) => {
    const p = JSON.parse(options.body);
    for (const c of p.state.candidates) { assert.equal(c.available, true); assert.equal(c.service, 'haircut'); assert.equal(c.date, '2026-10-03'); }
    return Response.json({ answers: { selection: { type: 'choice', choice: p.state.candidates[0].id } } });
  });
  assert.ok((await runDemo({ kind: 'appointment', goal: 'Morning', date: '2026-10-03', service: 'haircut' }, routers)).selected);
});
test('expense rows are batched once and every answer must be valid', async () => {
  let calls = 0;
  const routers = createRouters({ TYPESAFE_API_KEY: 'test' }, async (_url, options) => {
    calls++; const p = JSON.parse(options.body);
    assert.equal(Object.keys(p.questions).length, 8);
    return Response.json({ answers: Object.fromEntries(Object.keys(p.questions).map(id => [id, { type: 'choice', choice: 'Other' }])) });
  });
  const result = await runDemo({ kind: 'expenses', goal: 'Categorize', transactions }, routers);
  assert.equal(Object.keys(result.answers).length, 8); assert.equal(calls, 1);
});
test('invalid dates, unsupported service, duplicate IDs, and missing keys fail clearly', async () => {
  assert.equal(demoInput.safeParse({ ...flight, date: '2026-02-30' }).success, false);
  assert.equal(demoInput.safeParse({ kind: 'appointment', goal: 'Book', date: '2026-10-01', service: 'invalid' }).success, false);
  assert.equal(demoInput.safeParse({ kind: 'expenses', goal: 'Sort', transactions: [transactions[0], transactions[0]] }).success, false);
  await assert.rejects(runDemo(flight, createRouters({})), /Add your Jev API key/);
});
test('model override is request-scoped and exact Jev exchange is exposed without credentials', async () => {
  const models = [];
  const routers = createRouters({ OPENROUTER_API_KEY: 'secret', OPENROUTER_MODEL: 'default/model' }, async (_url, options) => {
    const payload = JSON.parse(options.body); models.push(payload.model);
    return Response.json({ choices: [{ message: { content: 'no_tool' } }] });
  });
  const state = { tools: [], userRequest: 'Unsupported request' };
  const custom = await routers.run('llm', state, { llmModel: 'chosen/model' });
  await routers.run('llm', state);
  assert.deepEqual(models, ['chosen/model', 'default/model']);
  assert.equal(custom.providerPayload.model, 'chosen/model');
  let sent;
  const response = { model: 'jev-test', answers: { selection: { type: 'choice', choice: 'no_match', confidence: 0.9 } }, usage: { input_tokens: 5, output_tokens: 1 } };
  const jev = createRouters({}, async (_url, options) => { sent = JSON.parse(options.body); return Response.json(response); });
  const result = await runDemo(flight, jev, 'private-key');
  assert.deepEqual(result.providerPayload, sent);
  assert.deepEqual(result.rawResponse, response);
  assert.ok(!JSON.stringify(result).includes('private-key'));
});
