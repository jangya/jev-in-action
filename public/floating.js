import './navigation.js';
import { keyHeaders } from './credentials.js';
import { setupKeySettings } from './key-settings.js';
import { supportSurfaces as registry } from './support-data.js';
import { createSupportWorkspace } from './support-surfaces.js';

const $ = id => document.getElementById(id);
let configured = false, revision = 0, debounce, controller, calls = 0;
const context = { activeSurface: null, resource: 'unspecified', diagnosticSummary: '', lastTicketId: null };
const workspace = createSupportWorkspace({ onOpen: openLocalSurface, onContext: update => Object.assign(context, update) });
const previewOptions = {
  help: { article: 'invite' }, access: { resource: 'figma' }, find_tool: { resource: 'analytics' },
  diagnostics: { resource: 'vpn' }, status: { resource: 'vpn' },
};
const json = value => JSON.stringify(value, null, 2);

async function refreshStatus() {
  const response = await fetch('/api/config', { headers: keyHeaders() });
  if (!response.ok) throw Error('Could not read API key status.');
  configured = (await response.json()).routers.jev.configured;
  $('key-label').textContent = configured ? 'Key configured' : 'Add API key';
  $('run-status').textContent = configured ? 'Live Jev ready · type to begin' : 'Preview below, or add a key for live decisions';
}
setupKeySettings({ refreshStatus });
refreshStatus().catch(error => { $('run-status').textContent = error.message; });

function cancel() {
  revision++;
  clearTimeout(debounce);
  controller?.abort();
  controller = null;
  $('surface').removeAttribute('aria-busy');
}
function clearDecision() {
  $('confidence').textContent = '—';
  $('latency').textContent = '—';
  $('model-input').textContent = 'No request for this input.';
  $('model-output').textContent = 'No response for this input.';
  $('exchange-status').textContent = 'Run a live request to inspect the exact exchange. Credentials are excluded.';
  $('error').hidden = true;
}
function emptySurface(message) {
  $('surface').replaceChildren();
  const panel = document.createElement('div'); panel.className = 'trace-empty';
  const title = document.createElement('strong'); title.textContent = message;
  const description = document.createElement('p'); description.textContent = 'Get help, find a work tool, request access, troubleshoot an issue, schedule IT support, or track a request.';
  panel.append(title, description); $('surface').append(panel);
}
function renderSurface(kind, input, preview, options = {}) {
  const diagnosticSummary = !preview && kind === 'ticket' && context.activeSurface === 'diagnostics' && options.resource === context.resource && context.resource !== 'unspecified' ? context.diagnosticSummary : '';
  const selected = { resource: 'unspecified', diagnosticSummary, ...(preview ? previewOptions[kind] : {}), ...options };
  context.activeSurface = kind;
  context.resource = selected.resource;
  context.diagnosticSummary = selected.diagnosticSummary || '';
  $('surface-source').textContent = preview ? 'Manual UI preview' : 'Live Jev selection';
  workspace.render(kind, input, selected);
}
function openLocalSurface(kind, input, options = {}) {
  cancel(); clearDecision();
  $('intent').value = input;
  renderSurface(kind, input, false, options);
  $('surface-source').textContent = 'Local workflow';
  $('decision-title').textContent = registry[kind].title;
  $('decision-detail').textContent = 'Opened by your explicit action within this demo. No new model request.';
  $('exchange-status').textContent = 'Local workflow. No model request or response for this step.';
  $('run-status').textContent = 'Review the details before submitting';
}

async function decide() {
  cancel(); clearDecision();
  const input = $('intent').value.trim();
  if (!input) return;
  emptySurface('Finding the right interface…');
  if (!configured) {
    $('run-status').textContent = 'Add a Jev API key to classify your words, or use a manual preview.';
    $('surface-source').textContent = 'No selection';
    $('decision-title').textContent = 'Connect Jev';
    $('decision-detail').textContent = 'Add your key for a live decision. Manual previews are available below.';
    emptySurface('Connect Jev to interpret your words.'); return;
  }
  const version = revision;
  controller = new AbortController();
  $('surface').setAttribute('aria-busy', 'true');
  $('surface-source').textContent = 'Waiting for Jev';
  $('decision-title').textContent = 'Reading your intent…';
  $('decision-detail').textContent = 'Only the current input can update this interface.';
  $('run-status').textContent = 'Asking Jev…';
  try {
    const response = await fetch('/api/floating', { method: 'POST', headers: { 'Content-Type': 'application/json', ...keyHeaders() }, body: JSON.stringify({ input, context: { ...context } }), signal: controller.signal });
    const result = await response.json();
    if (version !== revision) return;
    if (!response.ok) throw Error(result.error || 'Could not select an interface.');
    calls++;
    $('model-calls').textContent = calls;
    $('model-input').textContent = json(result.exchange.request);
    $('model-output').textContent = json(result.exchange.response);
    $('exchange-status').textContent = `Exact exchange for “${input}”.`;
    $('confidence').textContent = result.confidence == null ? '—' : `${(result.confidence * 100).toFixed(1)}%`;
    $('latency').textContent = `${result.latencyMs} ms`;
    $('decision-title').textContent = registry[result.surface]?.title || 'Unclear intent';
    $('decision-detail').textContent = `${result.model} · ${result.surface === 'unclear' ? 'Add detail or ask for one supported action.' : 'Jev selected a registered interface. Fields are copied from your words where possible; review them before confirming.'}`;
    renderSurface(result.surface, input, false, { resource: result.resource, article: result.article });
    $('run-status').textContent = result.surface === 'unclear' ? 'No matching interface · try a more specific request' : 'Interface ready · review the fields below';
  } catch (error) {
    if (version !== revision) return;
    $('error').textContent = error.message; $('error').hidden = false;
    $('run-status').textContent = 'Request failed · try again';
    $('decision-title').textContent = 'No decision available';
    $('decision-detail').textContent = 'The provider request failed. No substitute decision was made.';
    $('surface-source').textContent = 'No selection';
    emptySurface('Could not select an interface.');
  } finally {
    if (version === revision) { controller = null; $('surface').removeAttribute('aria-busy'); }
  }
}
$('intent-form').addEventListener('submit', event => { event.preventDefault(); decide(); });
$('intent').addEventListener('input', () => {
  cancel(); clearDecision();
  $('surface-source').textContent = 'Waiting for intent';
  $('decision-title').textContent = 'Waiting for your words'; $('decision-detail').textContent = 'No model decision for this input yet.';
  emptySurface('Your words choose what appears here.');
  $('run-status').textContent = configured ? 'Waiting for a pause in typing…' : 'Add a key for live decisions, or preview below';
  if ($('intent').value.trim() && configured) debounce = setTimeout(decide, 650);
});
$('intent').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('intent-form').requestSubmit(); }
  if (event.key === 'Escape') $('reset').click();
});
$('reset').addEventListener('click', () => {
  cancel(); clearDecision(); $('intent').value = '';
  $('surface-source').textContent = 'Waiting for intent'; $('decision-title').textContent = 'Waiting for your words'; $('decision-detail').textContent = 'No model request for this input.';
  context.activeSurface = null; context.resource = 'unspecified'; context.diagnosticSummary = '';
  $('run-status').textContent = 'Ready when you are'; emptySurface('Your words choose what appears here.'); $('intent').focus();
});
for (const [kind, entry] of Object.entries(registry)) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'floating-example';
  const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = entry.icon;
  const title = document.createElement('strong'); title.textContent = entry.title;
  const prompt = document.createElement('small'); prompt.textContent = entry.prompt;
  button.append(icon, title, prompt);
  button.setAttribute('aria-label', `Preview ${entry.title}`);
  button.addEventListener('click', () => {
    cancel(); clearDecision(); $('intent').value = entry.prompt;
    $('decision-title').textContent = entry.title; $('decision-detail').textContent = 'Manual UI preview · chosen by you. No model was called.';
    $('run-status').textContent = 'Manual preview · run Jev to classify this request';
    $('exchange-status').textContent = 'Manual preview. No model request or response.';
    renderSurface(kind, entry.prompt, true);
  });
  $('examples').append(button);
}
window.addEventListener('pagehide', cancel);
