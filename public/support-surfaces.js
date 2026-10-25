import { supportSurfaces, tools, articles, sampleTickets } from './support-data.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const $ = id => document.getElementById(id);
const toolOptions = selected => `<option value="">Choose a tool</option>${tools.map(tool => `<option value="${tool.id}" ${tool.id === selected ? 'selected' : ''}>${tool.name}</option>`).join('')}`;
const toolsById = id => tools.find(tool => tool.id === id);
const label = (id, title, content) => `<label for="${id}">${title}</label>${content}`;
const inputField = (id, title, value = '', required = true) => label(id, title, `<input id="${id}" maxlength="200" value="${escape(value.slice(0, 200))}" ${required ? 'required' : ''}>`);
const toolField = selected => label('support-tool', 'Work tool', `<select id="support-tool" required>${toolOptions(selected)}</select>`);
const textField = (id, title, value = '') => label(id, title, `<textarea id="${id}" rows="3" maxlength="2000" required>${escape(value)}</textarea>`);
const submit = title => `<button class="button primary support-submit" type="submit">${title} →</button>`;
const select = (id, title, values) => label(id, title, `<select id="${id}" required>${values.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select>`);

// Only in-memory demo records. Reloading clears newly created requests.
export function createSupportWorkspace({ onOpen, onContext }) {
  const tickets = sampleTickets.map(ticket => ({ ...ticket, history: [...ticket.history], source: 'Sample ticket' }));
  let nextId = 200;
  let lastTicketId = null;
  function addRecord(record) {
    const ticket = { ...record, id: `SUP-${nextId++}`, source: 'Created in this page', history: ['Demo request created', record.detail] };
    tickets.unshift(ticket); lastTicketId = ticket.id;
    onContext({ lastTicketId });
    const list = $('activity');
    if (!list.dataset.started) { list.replaceChildren(); list.dataset.started = 'true'; }
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'text-button support-record';
    button.textContent = `${ticket.id} · ${ticket.title}`;
    button.addEventListener('click', () => onOpen('tracking', ticket.id, { resource: 'unspecified', ticketId: ticket.id }));
    const detail = document.createElement('span'); detail.className = 'small'; detail.textContent = `${ticket.type} · ${ticket.status} · ${ticket.team}`;
    li.append(button, detail); list.prepend(li);
    while (list.children.length > 20) list.lastElementChild.remove();
    return ticket;
  }
  function confirmation(ticket, message) {
    $('surface-feedback').textContent = `${message} ${ticket.id}. This is a local demo record.`;
    $('surface-result').innerHTML = `<div class="support-notice"><strong>${escape(ticket.id)} · ${escape(ticket.status)}</strong><p>${escape(ticket.detail)}</p><button id="view-created" type="button" class="button secondary">View request</button></div>`;
    $('view-created').addEventListener('click', () => onOpen('tracking', ticket.id, { ticketId: ticket.id }));
    $('surface-form').querySelector('button[type="submit"]').disabled = true;
  }
  function openTicket(input, resource, diagnosticSummary = '') {
    onOpen('ticket', input, { resource, diagnosticSummary });
  }
  function render(kind, input, { resource = 'unspecified', article = 'no_match', diagnosticSummary = '', ticketId } = {}) {
    const entry = supportSurfaces[kind];
    if (!entry) {
      $('surface').innerHTML = '<div class="trace-empty"><span aria-hidden="true">?</span><strong>Which kind of help do you need?</strong><p>Try one request at a time: find a tool, get access, troubleshoot, read a guide, check service status, schedule IT support, or track a ticket. The examples below let you choose directly.</p></div>';
      return;
    }
    let body = '';
    const tool = toolsById(resource);
    if (kind === 'access') body = `${toolField(resource)}${select('permission', 'Requested permission', [['', 'Choose a permission'], ['viewer', 'Viewer · read only'], ['editor', 'Editor · create and edit']])}${textField('reason', 'Business reason', input)}<p class="small support-policy">Every request needs the tool owner’s approval. No access is granted by this demo.</p>${submit('Submit demo access request')}`;
    if (kind === 'ticket') body = `${inputField('ticket-title', 'Issue summary', input)}${select('support-team', 'Support team', [['Workplace IT', 'Workplace IT'], ['IT Infrastructure', 'IT Infrastructure'], ['Identity & Access', 'Identity & Access'], ['Data Platform', 'Data Platform'], ['Developer Experience', 'Developer Experience']])}${select('priority', 'Priority · choose based on impact', [['Normal', 'Normal · I can keep working'], ['High', 'High · my work is blocked'], ['Urgent', 'Urgent · multiple people are blocked']])}${textField('ticket-detail', 'What happened?', input)}${diagnosticSummary ? `<div class="support-notice"><strong>Diagnostics attached</strong><p id="attached-diagnostics">${escape(diagnosticSummary)}</p></div>` : ''}<p class="small support-policy">Do not include passwords, verification codes, or confidential data.</p>${submit('Create demo ticket')}`;
    if (kind === 'meeting') {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      // Future sample slots only. This is not a connected availability calendar.
      const tomorrow = new Date(`${today}T00:00:00+05:30`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow);
      body = `${inputField('meeting-topic', 'Meeting topic', input)}<div class="surface-fields">${label('meeting-date', 'Meeting date', `<input id="meeting-date" type="date" min="${date}" value="${date}" required>`)}${select('meeting-time', 'Sample slot · 30 min · IST', [['', 'Choose a sample slot'], ['10:00', '10:00 AM'], ['14:00', '2:00 PM'], ['16:00', '4:00 PM']])}</div>${select('meeting-team', 'Meet with', [['Workplace IT', 'Workplace IT'], ['IT Infrastructure', 'IT Infrastructure'], ['Identity & Access', 'Identity & Access']])}<p class="small support-policy">All slots are sample availability. No calendar invite or email will be sent.</p>${submit('Confirm demo meeting')}`;
    }
    if (kind === 'help') body = `${label('help-guide', 'Sample knowledge base', `<select id="help-guide"><option value="">Choose a guide</option>${articles.map(guide => `<option value="${guide.id}" ${guide.id === article ? 'selected' : ''}>${guide.title}</option>`).join('')}</select>`)}<div id="guide-content"></div><button id="escalate" type="button" class="button secondary support-submit">Still need help? Create a ticket</button>`;
    if (kind === 'find_tool') body = `${inputField('tool-search', 'Search the demo directory', tool?.name || '', false)}<div id="directory" class="support-directory"></div>`;
    if (kind === 'status') body = `${label('status-tool', 'Sample service', `<select id="status-tool"><option value="">All services</option>${tools.map(item => `<option value="${item.id}" ${item.id === resource ? 'selected' : ''}>${item.name}</option>`).join('')}</select>`)}<p class="small support-policy">Static demo bulletins · not a live service monitor.</p><div id="service-list" class="support-directory"></div><button id="escalate" type="button" class="button secondary support-submit">Report a separate issue</button>`;
    if (kind === 'diagnostics') body = `${toolField(resource)}${select('network-check', 'Can you reach other work websites?', [['', 'Choose your observation'], ['yes', 'Yes, other sites load'], ['no', 'No, other sites also fail'], ['unknown', 'I have not checked yet']])}${select('restart-check', 'Have you restarted the affected app?', [['', 'Choose your observation'], ['yes', 'Yes, the problem remains'], ['no', 'No, not yet']])}<p class="small support-policy">Guided self-check only. This page does not inspect your device or network.</p>${submit('Review troubleshooting steps')}<div id="diagnostic-result"></div>`;
    if (kind === 'tracking') body = `${inputField('ticket-id', 'Request ID', ticketId || input.match(/\bSUP-\d{3,6}\b/i)?.[0]?.toUpperCase() || (/\b(?:it|that|my|last|this)\b/i.test(input) ? lastTicketId || '' : ''))}${submit('Find request')}<div id="ticket-result"></div>`;
    $('surface').innerHTML = `<div class="intent-surface"><div class="surface-heading"><span class="surface-icon" aria-hidden="true">${entry.icon}</span><div><h3>${entry.title}</h3><p class="small">${entry.detail}</p></div></div><form id="surface-form">${body}</form><p id="surface-feedback" class="small" role="status"></p><div id="surface-result"></div></div>`;
    const form = $('surface-form');
    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('input', () => {
      if ($('support-tool')) onContext({ resource: $('support-tool').value || 'unspecified' });
      if (kind === 'diagnostics') { $('diagnostic-result').replaceChildren(); onContext({ diagnosticSummary: '' }); }
      const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = false; });
    if (kind === 'access') form.addEventListener('submit', () => {
      const selected = toolsById($('support-tool').value);
      const reason = $('reason').value.trim();
      if (!reason) { $('surface-feedback').textContent = 'Describe why you need access.'; return; }
      confirmation(addRecord({ title: `${selected.name} · ${$('permission').value} access`, type: 'Access request', status: 'Awaiting approval', team: selected.owner, detail: `${selected.approval} must approve. Reason: ${reason}` }), 'Access request submitted:');
    });
    if (kind === 'ticket' && tool && [...$('support-team').options].some(option => option.value === tool.owner)) $('support-team').value = tool.owner;
    if (kind === 'ticket') form.addEventListener('submit', () => {
      const title = $('ticket-title').value.trim(), detail = $('ticket-detail').value.trim();
      if (!title || !detail) { $('surface-feedback').textContent = 'Add a summary and describe the issue.'; return; }
      confirmation(addRecord({ title, type: 'Support ticket', status: 'Open', team: $('support-team').value, detail, priority: $('priority').value, diagnosticSummary }), 'Ticket created:');
    });
    if (kind === 'meeting') form.addEventListener('submit', () => {
      const title = $('meeting-topic').value.trim();
      if (!title) { $('surface-feedback').textContent = 'Add a meeting topic.'; return; }
      if (tickets.some(ticket => ticket.type === 'Support meeting' && ticket.date === $('meeting-date').value && ticket.time === $('meeting-time').value && ticket.team === $('meeting-team').value)) {
        $('surface-feedback').textContent = 'That sample slot is already reserved in this page. Choose another time.'; return;
      }
      confirmation(addRecord({ title, type: 'Support meeting', status: 'Demo scheduled', team: $('meeting-team').value, date: $('meeting-date').value, time: $('meeting-time').value, detail: `${$('meeting-date').value} at ${$('meeting-time').value} IST · 30 minutes. No invitation was sent.` }), 'Meeting recorded:');
    });
    if (kind === 'help') {
      const paint = () => {
        const guide = articles.find(item => item.id === $('help-guide').value);
        $('guide-content').innerHTML = guide ? `<div class="support-notice"><span class="pill neutral">Sample guide · ${guide.team}</span><h4>${guide.title}</h4><ol>${guide.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol><p class="small">${guide.note}</p></div>` : '<div class="support-notice"><strong>No matching guide selected.</strong><p>Choose one of the available sample guides, or create a ticket with your question. We won’t substitute an unrelated answer.</p></div>';
      };
      $('help-guide').addEventListener('change', paint); paint();
      $('escalate').addEventListener('click', () => openTicket(input, resource));
    }
    if (kind === 'find_tool') {
      const paint = () => {
        const query = $('tool-search').value.trim().toLowerCase();
        const results = tools.filter(item => `${item.name} ${item.purpose} ${item.owner}`.toLowerCase().includes(query));
        $('directory').innerHTML = results.length ? results.map(item => `<div class="support-item"><div><strong>${item.name}</strong><p>${item.purpose}</p><small>Owner: ${item.owner}</small>${item.url ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer">Public product site ↗</a>` : '<small>Internal URL not configured in this demo.</small>'}</div><button type="button" class="button secondary" data-access="${item.id}">Request access</button></div>`).join('') : '<p class="small">No tool matches. Try a name, purpose, or owner.</p>';
        $('directory').querySelectorAll('[data-access]').forEach(button => button.addEventListener('click', () => onOpen('access', `I need access to ${toolsById(button.dataset.access).name}`, { resource: button.dataset.access })));
      };
      $('tool-search').addEventListener('input', paint); paint();
    }
    if (kind === 'status') {
      const paint = () => {
        const selected = $('status-tool').value;
        $('service-list').innerHTML = tools.filter(item => !selected || item.id === selected).map(item => `<div class="support-item"><div><strong>${item.name}</strong><p>${item.bulletin}</p><small>${item.owner}</small></div><span class="pill ${item.status === 'Degraded' ? 'support-warning' : 'neutral'}">${item.status}</span></div>`).join('');
      };
      $('status-tool').addEventListener('change', paint); paint();
      $('escalate').addEventListener('click', () => openTicket(input, $('status-tool').value || 'unspecified'));
    }
    if (kind === 'diagnostics') form.addEventListener('submit', () => {
      const selected = toolsById($('support-tool').value);
      const summary = `${selected.name}: other websites ${$('network-check').value === 'yes' ? 'load' : $('network-check').value === 'no' ? 'also fail' : 'not checked'}; app ${$('restart-check').value === 'yes' ? 'restarted, issue remains' : 'not restarted'}.`;
      onContext({ resource: selected.id, diagnosticSummary: summary });
      const steps = $('network-check').value === 'no' ? 'Check your connection and try another network if company policy allows. Contact IT if other sites remain unreachable.' : $('restart-check').value === 'no' ? 'Save your work, restart the app, and try again. If it still fails, include the error message in a ticket.' : 'Record the exact error and when it happened. The next step is a support ticket for IT to investigate.';
      $('diagnostic-result').innerHTML = `<div class="support-notice"><strong>Based on your answers</strong><p>${escape(summary)}</p><p>${steps}</p>${selected.status === 'Degraded' ? `<p>${selected.bulletin}</p>` : ''}<button id="diagnostic-ticket" type="button" class="button secondary">Create ticket with diagnostics</button></div>`;
      $('diagnostic-ticket').addEventListener('click', () => openTicket(input, selected.id, summary));
    });
    if (kind === 'tracking') {
      const lookup = () => {
        const id = $('ticket-id').value.trim().toUpperCase();
        const record = tickets.find(ticket => ticket.id === id);
        $('ticket-result').innerHTML = record ? `<div class="support-notice"><span class="pill neutral">${record.source}</span><h4>${record.id} · ${escape(record.title)}</h4><p><strong>${record.status}</strong> · ${record.team}${record.priority ? ` · ${record.priority} priority` : ''}</p><p>${escape(record.detail)}</p>${record.diagnosticSummary ? `<p><strong>Diagnostics:</strong> ${escape(record.diagnosticSummary)}</p>` : ''}<ol>${record.history.map(item => `<li>${escape(item)}</li>`).join('')}</ol></div>` : '<p class="support-policy small" role="status">No request found in this page. Try SUP-104 or SUP-105, or a request you created during this visit.</p>';
      };
      form.addEventListener('submit', lookup);
      if ($('ticket-id').value) lookup();
    }
  }
  return { render };
}
