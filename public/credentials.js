const name = 'jev-playground-keys';
export function readKeys() {
  try {
    const session = sessionStorage.getItem(name);
    const storage = session ? sessionStorage : localStorage;
    const parsed = JSON.parse(session || storage.getItem(name) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const keys = Object.fromEntries(['jev', 'llm', 'llmModel'].filter(key => typeof parsed[key] === 'string').map(key => [key, parsed[key]]));
    // Migrate the previous default without clearing credentials or other model choices.
    if (keys.llmModel === 'nvidia/nemotron-3.5-lightning:free') {
      keys.llmModel = 'openai/gpt-4.1-mini';
      try { storage.setItem(name, JSON.stringify(keys)); } catch { /* Use the migrated value even if storage is read-only. */ }
    }
    return keys;
  }
  catch { return {}; }
}
export function keyHeaders() {
  const keys = readKeys();
  return { ...(keys.jev ? { 'x-jev-key': keys.jev } : {}), ...(keys.llm ? { 'x-llm-key': keys.llm } : {}), ...(keys.llmModel ? { 'x-llm-model': keys.llmModel } : {}) };
}
export function saveKeys(keys, remember) {
  // Write successfully before removing the previous storage choice.
  const target = remember ? localStorage : sessionStorage;
  target.setItem(name, JSON.stringify(keys));
  (remember ? sessionStorage : localStorage).removeItem(name);
}
export function clearKeys() { sessionStorage.removeItem(name); localStorage.removeItem(name); }
export function remembered() { try { return Boolean(localStorage.getItem(name)); } catch { return false; } }
