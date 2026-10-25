import assert from 'node:assert/strict';

// Synthetic fixture routing verifies plumbing and UI, not live Jev quality.
export function floatingFixture(payload) {
  if (!payload.questions?.surface) return null;
  const text = payload.state.input;
  const surface = /SUP-\d|track|status of.*request/i.test(text) ? 'tracking' : /access/i.test(text) ? 'access' : /where|find.*tool/i.test(text) ? 'find_tool' : /down|outage/i.test(text) ? 'status' : /meeting|schedule/i.test(text) ? 'meeting' : /ticket|report/i.test(text) ? 'ticket' : /how|guide/i.test(text) ? 'help' : /VPN|disconnect/i.test(text) ? 'diagnostics' : 'unclear';
  const resource = /figma/i.test(text) ? 'figma' : /VPN/i.test(text) ? 'vpn' : /analytics/i.test(text) ? 'analytics' : 'unspecified';
  const article = /invite.*teammate/i.test(text) ? 'invite' : 'no_match';
  return Response.json({ model: 'TEST-FIXTURE-JEV', answers: {
    surface: { type: 'choice', choice: surface, confidence: 0.82 },
    resource: { type: 'choice', choice: resource }, article: { type: 'choice', choice: article },
  } });
}
export async function verifyFloating(page, base, { screenshots = false, visitorKey } = {}) {
  const errors = [];
  let expectedFailure = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type()) && !(expectedFailure && message.text().includes('502'))) errors.push(message.text()); });
  if (screenshots) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/floating.html');
  await page.locator('#key-label').filter({ hasText: /configured|Add API key/ }).waitFor();
  if (visitorKey) {
    await page.locator('#open-keys').click(); await page.locator('#jev-key').fill(visitorKey);
    await page.getByRole('button', { name: 'Save keys', exact: true }).click();
    await page.locator('#key-dialog').waitFor({ state: 'hidden' });
    await page.locator('#key-label').filter({ hasText: 'Key configured' }).waitFor();
  }
  const preview = title => page.getByRole('button', { name: `Preview ${title}`, exact: true }).click();
  await preview('Request access');
  assert.equal(await page.locator('#support-tool').inputValue(), 'figma');
  assert.equal(await page.locator('#confidence').textContent(), '—');
  assert.equal(await page.locator('#surface-source').textContent(), 'Manual UI preview');
  if (screenshots) {
    await page.locator('.topbar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-artifacts/floating-desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.locator('.topbar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-artifacts/floating-mobile.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1100 });
  }
  // Confirming a request requires a permission and never grants access.
  await page.getByRole('button', { name: 'Submit demo access request' }).click();
  assert.equal(await page.locator('#activity button').count(), 0);
  await page.locator('#permission').selectOption('viewer');
  await page.getByRole('button', { name: 'Submit demo access request' }).click();
  assert.match(await page.locator('#surface-result').textContent(), /SUP-200.*Awaiting approval/);
  await page.getByRole('button', { name: 'View request', exact: true }).click();
  assert.match(await page.locator('#ticket-result').textContent(), /Figma.*viewer access/);
  assert.equal(await page.locator('#surface-source').textContent(), 'Local workflow');
  // Directory leads to the correct access form without another model call.
  await preview('Find a tool');
  assert.match(await page.locator('#directory').textContent(), /Data Platform/);
  await page.locator('#directory').getByRole('button', { name: 'Request access', exact: true }).click();
  assert.equal(await page.locator('#support-tool').inputValue(), 'analytics');
  await preview('Help & how-to');
  assert.match(await page.locator('#guide-content').textContent(), /Invite a teammate/);
  await page.locator('#escalate').click();
  assert.match(await page.locator('#ticket-title').inputValue(), /invite a teammate/);
  await preview('Service status');
  assert.match(await page.locator('#service-list').textContent(), /INC-208/);
  await preview('Troubleshoot an issue');
  await page.locator('#network-check').selectOption('yes');
  await page.locator('#restart-check').selectOption('yes');
  await page.getByRole('button', { name: 'Review troubleshooting steps' }).click();
  await preview('Create a ticket');
  assert.equal(await page.locator('#attached-diagnostics').count(), 0, 'A separate issue must not inherit old diagnostics');
  await preview('Troubleshoot an issue');
  await page.locator('#network-check').selectOption('yes');
  await page.locator('#restart-check').selectOption('yes');
  await page.getByRole('button', { name: 'Review troubleshooting steps' }).click();
  await page.getByRole('button', { name: 'Create ticket with diagnostics' }).click();
  assert.match(await page.locator('#attached-diagnostics').textContent(), /Company VPN.*restarted/);
  await page.locator('#ticket-title').fill('<script>alert(1)</script>');
  await page.getByRole('button', { name: 'Create demo ticket' }).click();
  await page.getByRole('button', { name: 'View request', exact: true }).click();
  assert.match(await page.locator('#ticket-result').textContent(), /Diagnostics:.*Company VPN/);
  assert.equal(await page.locator('#ticket-result script').count(), 0);
  await preview('Schedule IT support');
  await page.locator('#meeting-time').selectOption('14:00');
  await page.getByRole('button', { name: 'Confirm demo meeting' }).click();
  assert.match(await page.locator('#surface-result').textContent(), /Demo scheduled/);
  assert.match(await page.locator('#surface-result').textContent(), /No invitation was sent/);
  await preview('Schedule IT support');
  await page.locator('#meeting-time').selectOption('14:00');
  await page.getByRole('button', { name: 'Confirm demo meeting' }).click();
  assert.match(await page.locator('#surface-feedback').textContent(), /already reserved/);
  await preview('Track a request');
  assert.match(await page.locator('#ticket-result').textContent(), /SUP-104.*Analytics/);
  await page.locator('#ticket-id').fill('SUP-999');
  await page.getByRole('button', { name: 'Find request' }).click();
  assert.match(await page.locator('#ticket-result').textContent(), /No request found/);
  // Typing invokes the actual server adapter with a synthetic provider response.
  await page.locator('#intent').fill('I need access to Figma');
  await page.locator('#surface-source').filter({ hasText: 'Live Jev selection' }).waitFor();
  assert.equal(await page.locator('#support-tool').inputValue(), 'figma');
  assert.equal(await page.locator('#confidence').textContent(), '82.0%');
  assert.match(await page.locator('#model-output').textContent(), /TEST-FIXTURE-JEV/);
  await page.locator('#intent').fill('How do I replace my keyboard?'); await page.locator('#intent').press('Enter');
  await page.locator('#surface-source').filter({ hasText: 'Live Jev selection' }).waitFor();
  assert.match(await page.locator('#guide-content').textContent(), /No matching guide/);
  await page.locator('#intent').fill('What is the weather?'); await page.locator('#intent').press('Enter');
  await page.locator('#decision-title').filter({ hasText: 'Unclear intent' }).waitFor();
  assert.equal(await page.locator('#surface-form').count(), 0);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const route = async route => { await held; await route.fulfill({ json: { surface: 'access', confidence: 1, model: 'STALE', latencyMs: 0, exchange: {} } }).catch(() => {}); };
  await page.route('**/api/floating', route);
  const requested = page.waitForRequest('**/api/floating');
  await page.locator('#intent').fill('Request access to Figma'); await page.locator('#intent').press('Enter'); await requested;
  await preview('Service status'); release(); await page.unroute('**/api/floating', route);
  assert.equal(await page.locator('#decision-title').textContent(), 'Service status');
  assert.equal(await page.locator('#surface-source').textContent(), 'Manual UI preview');
  expectedFailure = true;
  await page.route('**/api/floating', route => route.fulfill({ status: 502, json: { error: 'Fixture provider unavailable' } }));
  await page.locator('#intent').fill('I need access to GitHub'); await page.locator('#intent').press('Enter');
  await page.locator('#error').filter({ hasText: 'Fixture provider unavailable' }).waitFor();
  assert.equal(await page.locator('#surface-form').count(), 0);
  await page.unroute('**/api/floating'); expectedFailure = false;
  for (const title of ['Request access', 'Find a tool', 'Help & how-to', 'Service status', 'Troubleshoot an issue', 'Create a ticket', 'Schedule IT support', 'Track a request']) {
    await preview(title);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${title} overflow at ${width}`);
    }
  }
  await page.locator('#reset').click(); assert.equal(await page.locator('#intent').inputValue(), '');
  assert.deepEqual(errors, []);
  await page.reload();
  assert.equal(await page.locator('#activity button').count(), 0, 'New records do not survive reload');
}
