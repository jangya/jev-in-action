import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouters } from '../server/routers.js';
import { floatingInput, decideSurface, surfaceCriteria } from '../server/floating.js';

test('floating UI validates input before inference', () => {
  for (const value of [{ input: ' ' }, { input: 'a'.repeat(1001) }, { input: 'test', surface: 'expense' }, {}]) {
    assert.equal(floatingInput.safeParse(value).success, false);
  }
  assert.deepEqual(floatingInput.parse({ input: ' request tool access ' }), { input: 'request tool access' });
});
test('floating selection preserves native confidence, exact exchange, cancellation, and credential isolation', async () => {
  let sent;
  const signal = new AbortController().signal;
  const raw = { model: 'TEST-FIXTURE-JEV', answers: { surface: { type: 'choice', choice: 'access', confidence: 0.42, probabilities: { access: 0.6, unclear: 0.4 } }, resource: { type: 'choice', choice: 'figma' }, article: { type: 'choice', choice: 'no_match' } } };
  const routers = createRouters({}, async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer visitor-secret');
    assert.equal(options.signal, signal);
    sent = JSON.parse(options.body);
    assert.equal(Object.keys(sent.questions).length, 3);
    assert.ok(sent.questions.surface.criteria.unclear);
    return Response.json(raw);
  });
  const result = await decideSurface({ input: 'I need access to Figma' }, routers, 'visitor-secret', signal);
  assert.equal(result.surface, 'access');
  assert.equal(result.confidence, 0.42);
  assert.deepEqual(result.exchange, { request: sent, response: raw });
  assert.ok(!JSON.stringify(result).includes('visitor-secret'));
});
test('unclear remains available; missing confidence is unavailable; invalid decisions and provider failures never substitute a UI', async () => {
  for (const choice of [...Object.keys(surfaceCriteria), 'generated_html']) {
    const routers = createRouters({ TYPESAFE_API_KEY: 'test' }, async () => Response.json({ answers: { surface: { type: 'choice', choice }, resource: { type: 'choice', choice: 'unspecified' }, article: { type: 'choice', choice: 'no_match' } } }));
    if (choice === 'generated_html') await assert.rejects(decideSurface({ input: 'hello' }, routers), /invalid decision/);
    else {
      const result = await decideSurface({ input: 'hello' }, routers);
      assert.equal(result.surface, choice); assert.equal(result.confidence, null);
    }
  }
  await assert.rejects(decideSurface({ input: 'hello' }, createRouters({})), /API key/);
  await assert.rejects(decideSurface({ input: 'hello' }, createRouters({ TYPESAFE_API_KEY: 'test' }, async () => new Response('{}', { status: 429 }))), /HTTP 429/);
});

test('support context is bounded and supplied as evidence for follow-up decisions', async () => {
  const context = { activeSurface: 'diagnostics', resource: 'vpn', diagnosticSummary: 'VPN restarted; issue remains.', lastTicketId: 'SUP-200' };
  const input = floatingInput.parse({ input: 'Create a ticket for this', context });
  assert.equal(floatingInput.safeParse({ ...input, context: { ...context, diagnosticSummary: 'x'.repeat(501) } }).success, false);
  assert.equal(floatingInput.safeParse({ ...input, context: { ...context, resource: 'invented' } }).success, false);
  const routers = createRouters({ TYPESAFE_API_KEY: 'test' }, async (_url, options) => {
    const sent = JSON.parse(options.body);
    assert.deepEqual(sent.state.context, context);
    assert.ok(sent.questions.article.criteria.no_match);
    assert.ok(sent.questions.resource.criteria.unspecified);
    return Response.json({ answers: { surface: { type: 'choice', choice: 'ticket' }, resource: { type: 'choice', choice: 'vpn' }, article: { type: 'choice', choice: 'no_match' } } });
  });
  const result = await decideSurface(input, routers);
  assert.equal(result.resource, 'vpn');
  assert.equal(result.article, 'no_match');
});
