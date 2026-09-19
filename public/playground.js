import './navigation.js';
import { flights, transactions, services, slotsFor } from './demo-data.js';
import { readKeys, saveKeys, clearKeys, remembered, keyHeaders } from './credentials.js';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = new Date(); today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
let selectedDate = iso(tomorrow), month = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1);
let view = 'flight', busy = false, result = null, rows = structuredClone(transactions), nextRow = 8;
const copy = {
  flight: { title: 'Your next flight, figured out.', subtitle: 'A few preferences. One flight that fits.', goal: 'Find me a flight to Delhi. I prefer non-stop, but one stop is fine if it saves money.', run: 'Find my flight', trace: 'Flight trace' },
  appointment: { title: 'Make time for what matters.', subtitle: 'Pick a day. Jev finds a moment that works.', goal: 'Find me an afternoon appointment, preferably after 3 PM.', run: 'Find a time', trace: 'Browser trace' },
  expenses: { title: 'Less sorting. More clarity.', subtitle: 'Turn a table of transactions into an organized picture.', goal: 'Label each transaction as Food, Travel, Entertainment, Income, Software, or Other.', run: 'Categorize expenses', trace: 'Batch decisions' },
};

const prompts = {
  flight: [copy.flight.goal, 'Choose the cheapest available flight, even if it has one stop.', 'I only want a non-stop flight arriving before 10 PM.', 'Find a flight departing after 6 PM. Prefer the lowest price.', 'I need to arrive before 7 PM.'],
  appointment: [copy.appointment.goal, 'Book the earliest available slot.', 'Find a time after 3 PM.', 'I’m free between noon and 4 PM. Pick the latest available slot.', 'I can only attend after 8 PM.'],
  expenses: [copy.expenses.goal, 'Categorize every transaction. Use Other when the description is unclear.', 'Treat streaming and music subscriptions as Entertainment.', 'Classify taxis and train tickets as Travel, and cloud hosting as Software.', 'Identify salary credits as Income and food delivery as Food.'],
};
$('shuffle-prompt').addEventListener('click', () => {
  const options = prompts[view].filter(prompt => prompt !== $('goal').value);
  $('goal').value = options[Math.floor(Math.random() * options.length)];
  resetResult(); $('goal').focus();
});

async function api(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { ...keyHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function error(text = '') { $('error').textContent = text; $('error').hidden = !text; }
function trace(items) {
  $('trace').innerHTML = items.map((item, i) => `<div class="trace-item"><span class="trace-number">${String(i + 1).padStart(2, '0')}</span><div><strong>${escape(item.title)}</strong><p>${escape(item.detail)}</p></div></div>`).join('');
}
function resetResult() {
  result = null; $('selection').hidden = true; $('result-summary').hidden = true; error();
  $('model-input').textContent = 'No request yet.'; $('model-output').textContent = 'No response yet.';
  $('exchange-status').textContent = 'Run a request to inspect the exact JSON sent and received. Credentials are excluded.';
  $('calls').textContent = $('latency').textContent = $('decisions').textContent = '—';
  $('run-status').textContent = 'Ready when you are';
  $('trace').innerHTML = '<div class="trace-empty"><span aria-hidden="true">⌁</span><strong>A little intelligence, on standby.</strong><p>Run your request to see the checks and decisions unfold here.</p></div>';
  document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('[data-category]').forEach(el => { el.className = 'pill neutral'; el.textContent = 'Pending'; });
}
function renderFlights() {
  $('flights').innerHTML = flights.map(f => `<article class="flight ${f.available ? '' : 'unavailable'}" id="flight-${f.id}"><div class="airline"><span class="airline-icon">${f.code}</span><div><strong>${f.airline}</strong><small>${f.id} · ${f.stops ? '1 stop' : 'Non-stop'}</small></div></div><div class="schedule"><strong>${f.departure} → ${f.arrival}</strong><small>Same day · IST</small></div><div class="fare"><strong>${money(f.price)}</strong><small>${f.available ? 'Available' : 'Sold out'}</small></div></article>`).join('');
}
function renderCalendar() {
  $('month-label').textContent = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  $('prev-month').disabled = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const start = (month.getDay() + 6) % 7, count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  $('calendar').innerHTML = '<span></span>'.repeat(start) + Array.from({ length: count }, (_, i) => {
    const d = new Date(month.getFullYear(), month.getMonth(), i + 1), value = iso(d);
    return `<button type="button" data-date="${value}" aria-label="${escape(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}" aria-pressed="${value === selectedDate}" class="${value === selectedDate ? 'chosen' : ''}" ${d < today ? 'disabled' : ''}>${i + 1}</button>`;
  }).join('');
  renderSlots();
}
function renderSlots() {
  $('slots-date').textContent = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  document.querySelector('.slots-heading .small').textContent = `${$('service').value === 'consultation' ? 60 : 30} min · IST`;
  $('slots').innerHTML = slotsFor(selectedDate, $('service').value).map(s => `<div class="slot ${s.available ? '' : 'occupied'}" id="${s.id}">${s.time}<small>${s.available ? 'Available' : 'Booked'}</small></div>`).join('');
}
function renderRows() {
  $('transactions').innerHTML = rows.map(row => `<tr data-id="${row.id}"><td><input data-field="description" aria-label="Description ${row.id}" value="${escape(row.description)}" maxlength="160" required></td><td><input data-field="amount" aria-label="Amount ${row.id}" type="number" min="-10000000" max="10000000" step="0.01" value="${row.amount}" required></td><td><span class="pill neutral" data-category="${row.id}">Pending</span></td><td><button type="button" data-remove="${row.id}" aria-label="Remove ${escape(row.description)}" ${rows.length === 1 ? 'disabled' : ''}>×</button></td></tr>`).join('');
  $('add-row').disabled = rows.length >= 20;
}
function showView(name) {
  view = name;
  for (const button of document.querySelectorAll('[data-view]')) { button.classList.toggle('active', button.dataset.view === view); button.setAttribute('aria-pressed', String(button.dataset.view === view)); }
  for (const key of Object.keys(copy)) $(key + '-view').hidden = view !== key;
  for (const key of ['flight', 'appointment']) {
    $(key + '-controls').hidden = view !== key;
    $(key + '-controls').querySelectorAll('input,select').forEach(el => { el.disabled = view !== key; });
  }
  $('view-title').textContent = copy[view].title; $('view-subtitle').textContent = copy[view].subtitle;
  $('trace-title').textContent = copy[view].trace; $('goal').value = copy[view].goal;
  $('run').textContent = copy[view].run + ' →';
  // Hidden expense fields must not block another flow's form validation.
  $('expenses-view').querySelectorAll('input').forEach(el => { el.disabled = view !== 'expenses'; });
  resetResult();
}
for (const tab of document.querySelectorAll('[data-view]')) tab.addEventListener('click', () => { if (!busy) showView(tab.dataset.view); });
$('flight-date').value = iso(tomorrow); $('flight-date').min = iso(today);
$('prev-month').addEventListener('click', () => { month.setMonth(month.getMonth() - 1); renderCalendar(); });
$('next-month').addEventListener('click', () => { month.setMonth(month.getMonth() + 1); renderCalendar(); });
$('calendar').addEventListener('click', event => { const button = event.target.closest('[data-date]'); if (!button) return; selectedDate = button.dataset.date; resetResult(); renderCalendar(); });
$('service').addEventListener('change', () => { resetResult(); renderSlots(); });
$('transactions').addEventListener('input', event => {
  const row = rows.find(r => r.id === event.target.closest('tr')?.dataset.id);
  if (row && event.target.dataset.field) { row[event.target.dataset.field] = event.target.dataset.field === 'amount' ? Number(event.target.value) : event.target.value; }
});
$('transactions').addEventListener('click', event => { const id = event.target.closest('[data-remove]')?.dataset.remove; if (!id) return; rows = rows.filter(row => row.id !== id); resetResult(); renderRows(); });
$('add-row').addEventListener('click', () => { rows.push({ id: `tx${nextRow++}`, description: '', amount: 0 }); resetResult(); renderRows(); $('transactions').lastElementChild.querySelector('input').focus(); });
$('demo-form').addEventListener('input', () => { if (!busy) resetResult(); });
$('demo-form').addEventListener('change', () => { if (!busy) resetResult(); });
$('reset').addEventListener('click', () => {
  $('budget').value = 15000; $('latest').value = '22:00'; $('stops').value = '1'; $('flight-date').value = iso(tomorrow); $('service').value = 'dental';
  selectedDate = iso(tomorrow); month = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1);
  rows = structuredClone(transactions); nextRow = 8; renderRows(); renderCalendar(); showView(view);
});
$('demo-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  resetResult();
  const payload = { kind: view, goal: $('goal').value };
  if (view === 'flight') Object.assign(payload, { date: $('flight-date').value, budget: Number($('budget').value), latest: $('latest').value, stops: Number($('stops').value) });
  if (view === 'appointment') Object.assign(payload, { date: selectedDate, service: $('service').value });
  if (view === 'expenses') payload.transactions = structuredClone(rows);
  busy = true; $('demo-fields').disabled = true; document.querySelectorAll('[data-view]').forEach(b => { b.disabled = true; });
  $('run').textContent = 'Jev is deciding…'; $('run-status').textContent = 'Sending your request…';
  trace([{ title: 'Request submitted', detail: view === 'expenses' ? 'Sending the table for a single batch evaluation.' : 'Checking demo availability and asking Jev to choose a match.' }]);
  try {
    result = await api('/api/demo', payload);
    trace(result.trace); $('calls').textContent = result.calls;
    $('model-input').textContent = result.providerPayload ? JSON.stringify(result.providerPayload, null, 2) : 'No model request: no eligible candidates.';
    $('model-output').textContent = result.rawResponse ? JSON.stringify(result.rawResponse, null, 2) : 'No model response: no API call was made.';
    $('exchange-status').textContent = result.calls ? 'Exact request and response JSON for this run. Credentials are excluded.' : 'No API call was needed for this run.';
    $('result-summary').hidden = false;
    $('summary-label').textContent = view === 'expenses' ? 'BATCH RESULT' : result.selected ? (view === 'flight' ? 'SELECTED FLIGHT' : 'SELECTED APPOINTMENT') : 'NO MATCH';
    $('summary-title').textContent = view === 'expenses' ? `${Object.keys(result.answers).length} transactions categorized` : result.selected ? '' : 'No matching option';
    $('summary-detail').textContent = view === 'expenses' ? Object.entries(Object.values(result.answers).reduce((counts, a) => { counts[a.choice] = (counts[a.choice] || 0) + 1; return counts; }, {})).map(([category, count]) => `${category}: ${count}`).join(' · ') : 'Adjust your preferences and try again.';

    $('latency').textContent = result.latencyMs == null ? '—' : `${result.latencyMs.toLocaleString()} ms`;
    $('decisions').textContent = Object.keys(result.answers).length;
    $('run-status').textContent = result.selected || view === 'expenses' ? 'Decision complete' : 'No matching option';
    if (view === 'expenses') {
      for (const [id, answer] of Object.entries(result.answers)) { const badge = document.querySelector(`[data-category="${id}"]`); badge.textContent = answer.choice; badge.className = `pill category ${answer.choice}`; }
    } else if (result.selected) {
      const selected = result.selected; $(view === 'flight' ? `flight-${selected.id}` : selected.id).classList.add('selected');
      $('selection').hidden = false; $('confirm').hidden = false; $('confirm').disabled = false;
      $('selection-title').textContent = view === 'flight' ? `${selected.airline} · ${money(selected.price)}` : `${selected.time} · ${services[selected.service]}`;
      $('selection-detail').textContent = view === 'flight' ? `${payload.date} · ${selected.departure} → ${selected.arrival} IST` : `${selected.date} · ${selected.provider}`;
      $('summary-title').textContent = $('selection-title').textContent;
      $('summary-detail').textContent = $('selection-detail').textContent;
    }
  } catch (err) { error(err.message); $('run-status').textContent = 'Request could not complete'; trace([{ title: 'Request failed', detail: err.message }]); }
  finally { busy = false; $('demo-fields').disabled = false; document.querySelectorAll('[data-view]').forEach(b => { b.disabled = false; }); $('run').textContent = copy[view].run + ' →'; }
});
$('confirm').addEventListener('click', () => {
  if (!result?.selected || $('confirm').disabled) return;
  $('confirm').disabled = true; $('confirm').hidden = true;
  $('selection-title').textContent = 'Demo booking confirmed ✓';
  $('selection-detail').textContent += ' · Simulated only. No real reservation made.';
  $('summary-label').textContent = 'DEMO BOOKING CONFIRMED';
  $('summary-detail').textContent = $('selection-detail').textContent;
  result.trace.push({ title: 'Demo booking confirmed', detail: 'The selected option was confirmed in this playground. No booking service was contacted.' }); trace(result.trace);
});
async function refreshStatus() {
  try {
    const config = await api('/api/config');
    if (config.hosted) $('key-storage-note').textContent = 'Keys are sent through this site’s server to the provider for each request. They are not saved on the server. Otherwise saved only for this browser session.';
    $('key-dot').classList.toggle('connected', config.routers.jev.configured);
    $('key-label').textContent = config.routers.jev.configured ? 'Key configured' : 'Add API key';
    $('key-status').textContent = config.routers.jev.configured ? 'Jev key configured. A demo run will verify access.' : 'Add a Jev key to run the demos.';
  } catch { $('key-label').textContent = 'Server offline'; $('key-status').textContent = 'Could not reach the local server.'; }
}
$('open-keys').addEventListener('click', () => { const keys = readKeys(); $('jev-key').value = keys.jev || ''; $('llm-key').value = keys.llm || ''; $('llm-model').value = keys.llmModel || ''; $('remember').checked = remembered(); $('key-dialog').showModal(); });
$('close-keys').addEventListener('click', () => $('key-dialog').close());
$('key-dialog').addEventListener('close', () => { $('jev-key').value = ''; $('llm-key').value = ''; });
$('key-form').addEventListener('submit', async event => {
  event.preventDefault();
  const keys = { jev: $('jev-key').value.trim(), llm: $('llm-key').value.trim(), llmModel: $('llm-model').value.trim() };
  if (keys.llmModel && !/^[a-zA-Z0-9._:/-]+$/.test(keys.llmModel)) { $('key-status').textContent = 'Enter a valid OpenRouter model ID, such as provider/model-name.'; return; }
  if (Object.values(keys).some(key => /[^\x21-\x7e]/.test(key))) { $('key-status').textContent = 'Keys cannot contain spaces or non-ASCII characters.'; return; }
  try { saveKeys(keys, $('remember').checked); await refreshStatus(); $('key-dialog').close(); }
  catch { $('key-status').textContent = 'Browser storage is unavailable. Enable storage to save your key.'; }
});
$('clear-keys').addEventListener('click', async () => {
  try { clearKeys(); $('jev-key').value = ''; $('llm-key').value = ''; $('remember').checked = false; $('llm-model').value = ''; await refreshStatus(); $('key-status').textContent = 'Browser keys cleared. Any server-configured keys still apply.'; }
  catch { $('key-status').textContent = 'Could not access browser storage.'; }
});
renderFlights(); renderRows(); renderCalendar();
const initialView = location.hash.slice(1);
showView(Object.hasOwn(copy, initialView) ? initialView : 'expenses'); refreshStatus();
