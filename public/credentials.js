const name = 'jev-playground-keys';
export function readKeys() {
  try { return JSON.parse(sessionStorage.getItem(name) || localStorage.getItem(name) || '{}'); }
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
