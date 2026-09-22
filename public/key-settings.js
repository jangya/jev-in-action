import { readKeys, saveKeys, clearKeys, remembered } from './credentials.js';

// Shared behavior for the playground and tool-selection credential dialogs.
export function setupKeySettings({ refreshStatus, isBusy = () => false }) {
  const $ = id => document.getElementById(id);
  const dialog = $('key-dialog');
  let saving = false;
  const lock = value => {
    saving = value;
    $('key-form').querySelectorAll('input, button').forEach(control => { control.disabled = value; });
  };
  $('open-keys').addEventListener('click', () => {
    if (isBusy()) return;
    const keys = readKeys();
    $('jev-key').value = keys.jev || '';
    $('llm-key').value = keys.llm || '';
    $('llm-model').value = keys.llmModel || '';
    $('remember').checked = remembered();
    dialog.showModal();
  });
  $('close-keys').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { $('jev-key').value = ''; $('llm-key').value = ''; });
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  $('key-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || isBusy()) return;
    const keys = { jev: $('jev-key').value.trim(), llm: $('llm-key').value.trim(), llmModel: $('llm-model').value.trim() };
    if (keys.llmModel && !/^[a-zA-Z0-9._:/-]+$/.test(keys.llmModel)) { $('key-status').textContent = 'Enter a valid OpenRouter model ID, such as provider/model-name.'; return; }
    if (Object.values(keys).some(key => /[^\x21-\x7e]/.test(key))) { $('key-status').textContent = 'Keys cannot contain spaces or non-ASCII characters.'; return; }
    try { saveKeys(keys, $('remember').checked); }
    catch { $('key-status').textContent = 'Browser storage is unavailable. Enable storage to save your keys.'; return; }
    lock(true);
    try { await refreshStatus(); dialog.close(); }
    catch { $('key-status').textContent = 'Keys saved, but server status could not be refreshed. Check the server and try again.'; }
    finally { lock(false); }
  });
  $('clear-keys').addEventListener('click', async () => {
    if (saving || isBusy()) return;
    try { clearKeys(); }
    catch { $('key-status').textContent = 'Could not access browser storage.'; return; }
    $('jev-key').value = ''; $('llm-key').value = ''; $('llm-model').value = ''; $('remember').checked = false;
    lock(true);
    try { await refreshStatus(); $('key-status').textContent = 'Browser keys cleared. Any server-configured keys still apply.'; }
    catch { $('key-status').textContent = 'Browser keys cleared. Server status is unavailable.'; }
    finally { lock(false); }
  });
}
