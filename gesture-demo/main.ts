import '../public/navigation.js';
import { keyHeaders, readKeys, saveKeys, clearKeys, remembered } from '../public/credentials.js';
import { GestureCamera } from './components/GestureCamera.js';
import { GestureCanvas } from './components/GestureCanvas.js';
import { createSimulator } from './components/GestureSimulator.js';
import { createToolbar } from './components/ToolBar.js';
import { showObservation, showDecision, clearDecision } from './components/JevDecisionPanel.js';
import { Interaction, grabKey } from './gesture/interaction.js';
import { handPointer } from './gesture/extractGestureFeatures.js';
import { target } from './tools/canvasTools.js';
import { hasGrip, isGripping, toolNames, type Observation, type Decision, type Gesture } from './types.js';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = new GestureCanvas(document.getElementById('gesture-canvas') as unknown as SVGSVGElement, el('canvas-summary'));
const interaction = new Interaction(canvas);
const highlight = createToolbar(el('tool-bar'));
let busy = false, generation = 0, request: AbortController | undefined;
// Confirmation is independent of the API clock. There is only one pending slot.
let latched: Gesture | null = null, releaseSince: number | null = null;
let lastRequest = -Infinity;
let pending: { observation: Observation; seenAt: number } | null = null;
let cooldownTimer: ReturnType<typeof setTimeout> | undefined;
let source: 'camera' | 'simulation' | null = null;
let latest: { observation: Observation; seenAt: number; kind: 'camera' | 'simulation' } | null = null;
let pinchEpisode = 0;
let trackingTimer: ReturnType<typeof setTimeout> | undefined;
function simulationControls() {
  const sim = latest?.kind === 'simulation' && hasGrip(latest.observation);
  for (const id of ['simulate-grab', 'simulate-fist']) el<HTMLButtonElement>(id).disabled = busy || canvas.state.dragging;
  for (const id of ['simulate-loss']) el<HTMLButtonElement>(id).disabled = !sim || !canvas.state.dragging;
  el<HTMLButtonElement>('simulate-move').disabled = !sim || !canvas.state.dragging;
  el<HTMLButtonElement>('simulate-outside').disabled = !sim || !canvas.state.dragging;
  el<HTMLButtonElement>('simulate-release').disabled = !sim;
}
function cancelTracking() {
  clearTimeout(trackingTimer); trackingTimer = undefined;
  pinchEpisode++; latest = null; interaction.cancel(); simulationControls();
}
function trackObservation(observation: Observation, kind: 'camera' | 'simulation', now = performance.now()) {
  const previous = latest;
  if (previous && (previous.kind !== kind || (kind === 'camera' && now - previous.seenAt > 250))) cancelTracking();
  const wasClosed = !!latest && hasGrip(latest.observation);
  const hands = observation.hands ?? [];
  const closed = hands.some(isGripping);
  const key = grabKey(hands);
  if (key !== grabKey(latest?.observation.hands ?? [])) pinchEpisode++;
  latest = { observation, seenAt: now, kind };
  clearTimeout(trackingTimer);
  if (kind === 'camera') trackingTimer = setTimeout(() => { cancelTracking(); pending = null; canvas.pointer(); el('run-status').textContent = 'Tracking stalled · grab cancelled'; }, 300);
  if (canvas.state.dragging) {
    interaction.update(hands);
    pending = null;
    if (!canvas.state.dragging) el('run-status').textContent = hands.length ? (canvas.state.completed ? 'Dropped in target ✓' : 'Grab ended') : 'Tracking lost · grab cancelled';
    simulationControls();
    return true;
  }
  if (wasClosed && !closed) pending = null;
  simulationControls();
  return false;
}
const RELEASE_MS = 350, API_SPACING_MS = 1800;
function isConfirmed(observation: Observation) {
  if (!observation.handCount) return false;
  if (observation.gesture === 'pinch_hold' || observation.gesture === 'grip_hold') return observation.hands?.filter(isGripping).length === 1 && (observation.hands.find(isGripping)?.gripDurationMs ?? observation.pinchDurationMs ?? 0) >= 200 && !!observation.pointerPosition && canvas.hits(observation.pointerPosition);
  if (observation.gesture === 'point_hold') return observation.holdDurationMs >= 500;
  if (observation.gesture === 'double_fist') return observation.resetCycles === 2;
  if (observation.gesture === 'unknown') return observation.pose === 'unknown' && observation.holdDurationMs >= 600;
  return false;
}
function flushPendingGesture() {
  clearTimeout(cooldownTimer); cooldownTimer = undefined;
  if (!pending) return;
  const now = performance.now();
  // Never replay a gesture after tracking stalls, the hand leaves, or it changes.
  if (now - pending.seenAt > RELEASE_MS) { pending = null; return; }
  if (busy) return;
  const remaining = API_SPACING_MS - (now - lastRequest);
  if (remaining > 0) { cooldownTimer = setTimeout(flushPendingGesture, remaining); return; }
  const observation = pending.observation;
  pending = null; lastRequest = now;
  void decide(observation, 'camera');
}
function invalidateCamera() {
  cancelTracking();
  latched = null; releaseSince = null; pending = null;
  clearTimeout(cooldownTimer); cooldownTimer = undefined; canvas.pointer();
  if (source !== null) { generation++; request?.abort(); el('run-status').textContent = 'Camera stopped · pending decision discarded'; }
}
function observeGesture(observation: Observation, now: number) {
  const confirmed = isConfirmed(observation);
  if (!confirmed || observation.gesture !== latched) {
    releaseSince ??= now;
    if (now - releaseSince >= RELEASE_MS) latched = null;
  } else releaseSince = null;
  // An unstable pose or different gesture invalidates the older pending input.
  if (!confirmed || pending?.observation.gesture !== observation.gesture) pending = null;
  if (confirmed) {
    if (latched !== observation.gesture) {
      latched = observation.gesture; releaseSince = null;
      pending = { observation, seenAt: now };
    } else if (pending) {
      // Refresh pointer/hold data without queuing another copy of a held gesture.
      pending = { observation, seenAt: now };
    }
  }
  flushPendingGesture();
}
const camera = new GestureCamera(el<HTMLVideoElement>('camera-video'), el<HTMLCanvasElement>('camera-overlay'), el<HTMLButtonElement>('camera-toggle'), el('camera-status'), observation => {
  canvas.pointer(observation.pointerPosition);
  el('live-gesture').textContent = `${observation.handCount} hand${observation.handCount === 1 ? '' : 's'} · ${observation.gesture.replaceAll('_', ' ')}`;
  const now = performance.now();
  if (trackObservation(observation, 'camera', now)) {
    // Release begins the existing 350 ms re-arm interval without submitting a tool.
    if (!canvas.state.dragging) observeGesture({ ...observation, gesture: 'unknown', holdDurationMs: 0 }, now);
    return;
  }
  if (!busy && hasGrip(observation)) el('run-status').textContent = canvas.hits(observation.pointerPosition!) ? 'Closed grip detected · hold briefly for JEV' : 'Closed grip detected · move the blue cursor onto the card';
  observeGesture(observation, now);
}, invalidateCamera);
async function decide(observation: Observation, from: 'camera' | 'simulation', simulateGrab = false) {
  if (busy) return;
  if (from === 'simulation') { camera.stop(); if (simulateGrab) trackObservation(observation, 'simulation'); }
  source = from; busy = true; const current = ++generation;
  const episode = pinchEpisode; const requestCanvas = canvas.context(observation.pointerPosition); simulationControls();
  request = new AbortController();
  const timer = setTimeout(() => request?.abort(), 48000);
  el('error').hidden = true; clearDecision(); showObservation(observation); canvas.pointer(observation.pointerPosition);
  el('run-status').textContent = 'JEV is deciding…'; el('source-label').textContent = from === 'camera' ? 'Webcam observation' : 'Simulated observation';
  document.querySelectorAll<HTMLButtonElement>('.simulation-card').forEach(b => b.disabled = true);
  try {
    const response = await fetch('/api/gesture', { method: 'POST', headers: { ...keyHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ observation, canvas: requestCanvas }), signal: request.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Decision failed.');
    if (current !== generation) return;
    if (data.tool !== null && !toolNames.includes(data.tool)) throw new Error('Invalid tool returned. Canvas unchanged.');
    const decision = data as Decision;
    if (decision.tool === 'drag') {
      const live = latest;
      if (observation.hands?.filter(isGripping).length !== 1 || !hasGrip(observation) || !requestCanvas.pointerOverObject || !live || live.kind !== from || episode !== pinchEpisode || !hasGrip(live.observation) ||
        !live.observation.pointerPosition || !canvas.hits(live.observation.pointerPosition) ||
        (from === 'camera' && performance.now() - live.seenAt > 250)) {
        showDecision(decision); highlight(null);
        el('run-status').textContent = 'Grab expired · keep the grip cursor on the card and try again';
        latched = null;
        return;
      }
      canvas.execute('drag', live.observation);
      interaction.start(live.observation.hands ?? []);
      pending = null;
    } else if (decision.tool === 'reset') {
      if (observation.gesture !== 'double_fist' || observation.resetCycles !== 2) { el('run-status').textContent = 'Reset ignored · close and open your fist twice'; return; }
      canvas.execute('reset', observation);
    } else if (decision.tool) canvas.execute(decision.tool, observation);
    highlight(decision.tool); showDecision(decision);
    el('run-status').textContent = decision.tool === 'drag' ? 'Grabbed · move your hand to drag, then open your hand to drop' : decision.tool === 'unclear' ? 'Unclear gesture · canvas unchanged' : decision.tool ? 'Decision applied · ready for another gesture' : 'No action · try a clearer gesture';
  } catch (error) {
    if (current !== generation) return;
    el('error').hidden = false; el('error').textContent = error instanceof Error && error.name !== 'AbortError' ? error.message : 'Request timed out. Try again.';
    el('run-status').textContent = 'Decision failed · canvas unchanged';
  } finally { clearTimeout(timer); busy = false; source = null; document.querySelectorAll<HTMLButtonElement>('.simulation-card').forEach(b => b.disabled = false); simulationControls(); flushPendingGesture(); }
}
createSimulator(el('simulations'), o => {
  if (o.gesture === 'point_hold') o.pointerPosition = { x: canvas.state.position.x / 800, y: canvas.state.position.y / 400 };
  void decide(o, 'simulation');
});
el('camera-toggle').addEventListener('click', () => { if (latest?.kind === 'simulation') invalidateCamera(); });
function simulateGrab(fist = false) {
  const center = { x: canvas.state.position.x / 800, y: canvas.state.position.y / 400 };
  const hands = [{ id: 1, pointer: center, pinchClosed: !fist, fistClosed: fist, gripDurationMs: 300, pinchDurationMs: fist ? 0 : 300, aperture: fist ? 2 : .3 }];
  const observation: Observation = { hands, pose: fist ? 'fist' : 'pinch', motion: 'stationary', stationary: true, movementSpeed: 0, circularMotionScore: 0, durationMs: 300, activeInteraction: 'pinch', pinchDistanceChange: 0, handSeparationChange: 0, handCount: hands.length, gesture: 'grip_hold', indexExtended: false, palmOpen: false, movementDirection: 'stationary', holdDurationMs: 300, pinchClosed: !fist, pinchDurationMs: fist ? 0 : 300, pointerPosition: handPointer(hands) };
  void decide(observation, 'simulation', true);
}
el('simulate-grab').addEventListener('click', () => simulateGrab());
el('simulate-fist').addEventListener('click', () => simulateGrab(true));
function simulateHands(hands: NonNullable<Observation['hands']>) {
  if (latest?.kind !== 'simulation') return;
  const observation = { ...latest.observation, hands, handCount: hands.length, pinchClosed: hands.some(h => h.pinchClosed), pointerPosition: handPointer(hands) };
  canvas.pointer(observation.pointerPosition); trackObservation(observation, 'simulation'); showObservation(observation);
}
function moveSimulation(x: number, y: number) {
  if (latest?.kind !== 'simulation' || !canvas.state.dragging) return;
  const hands = latest.observation.hands!, point = handPointer(hands)!;
  simulateHands(hands.map(h => ({ ...h, pointer: { x: h.pointer.x + x / 800 - point.x, y: h.pointer.y + y / 400 - point.y } })));
}
el('simulate-move').addEventListener('click', () => moveSimulation(target.x, target.y));
el('simulate-outside').addEventListener('click', () => moveSimulation(230, 200));
el('simulate-release').addEventListener('click', () => simulateHands((latest?.observation.hands ?? []).map(h => ({ ...h, pinchClosed: false, fistClosed: false, gripDurationMs: 0, pinchDurationMs: 0 }))));
el('simulate-loss').addEventListener('click', () => simulateHands([]));
const dialog = el<HTMLDialogElement>('key-dialog');
el('open-keys').addEventListener('click', () => { el<HTMLInputElement>('jev-key').value = readKeys().jev || ''; el<HTMLInputElement>('remember').checked = remembered(); dialog.showModal(); });
el('close-keys').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => el<HTMLInputElement>('jev-key').value = '');
el('key-form').addEventListener('submit', async event => {
  event.preventDefault(); const key = el<HTMLInputElement>('jev-key').value.trim();
  if (key && /[^\x21-\x7e]/.test(key)) { el('key-status').textContent = 'Enter a key without spaces or non-ASCII characters.'; return; }
  try { saveKeys({ ...readKeys(), jev: key }, el<HTMLInputElement>('remember').checked); await refreshStatus(); dialog.close(); }
  catch { el('key-status').textContent = 'Browser storage is unavailable.'; }
});
el('clear-keys').addEventListener('click', () => { try { clearKeys(); el<HTMLInputElement>('jev-key').value = ''; el<HTMLInputElement>('remember').checked = false; void refreshStatus(); } catch { el('key-status').textContent = 'Could not clear browser storage.'; } });
async function refreshStatus() {
  try { const response = await fetch('/api/config', { headers: keyHeaders() }); if (!response.ok) throw new Error(); const config = await response.json(); el('key-label').textContent = config.routers.jev.configured ? 'Key configured' : 'Add API key'; el('key-status').textContent = config.routers.jev.configured ? 'JEV key configured. Run a gesture to verify access.' : 'Add a JEV API key to use camera or simulation decisions.'; }
  catch { el('key-label').textContent = 'Server unavailable'; }
}
void refreshStatus();
