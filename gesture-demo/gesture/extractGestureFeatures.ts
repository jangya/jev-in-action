import { isGripping } from '../types.js';
import type { HandSample, Observation, Point, Gesture, TrackedHand } from '../types.js';
import { ResetGesture } from './resetGesture.js';
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
type Track = { hand: TrackedHand; wrist: Point; label: string; since: number; gripSince: number; samples: (Omit<HandSample, 'ageMs'> & { time: number })[] };
export const handPointer = (hands: TrackedHand[]): Point | undefined => {
  const closed = hands.filter(isGripping);
  const selected = closed.length ? closed : hands.slice(0, 1);
  return selected.length ? { x: selected.reduce((s, h) => s + h.pointer.x, 0) / selected.length, y: selected.reduce((s, h) => s + h.pointer.y, 0) / selected.length } : undefined;
};
export class GestureExtractor {
  private resetGesture = new ResetGesture();
  private tracks: Track[] = [];
  private nextId = 1;
  private lastTime = 0;
  private held: Gesture = 'unknown';
  private holdStart = 0;
  private anchor?: Point;
  // IDs are never reused, even across resets, so old authorizations cannot match.
  reset() { this.resetGesture.reset(); this.tracks = []; this.lastTime = 0; this.anchor = undefined; this.held = 'unknown'; }
  extract(landmarks: Point[][], time: number, labels: string[] = []): Observation {
    if (time - this.lastTime > 250) this.reset();
    const elapsed = Math.max(1, time - this.lastTime); this.lastTime = time;
    const valid = landmarks.filter(h => h.length >= 21).slice(0, 2);
    // Enumerate the tiny assignment space; array order and handedness alone are
    // not identities. Ambiguous crossings deliberately create new IDs (cancel).
    const assignments: { ids: number[]; cost: number }[] = [];
    const visit = (i: number, ids: number[], cost: number) => {
      if (i === valid.length) { assignments.push({ ids, cost }); return; }
      visit(i + 1, [...ids, -1], cost + .3);
      this.tracks.forEach((t, j) => {
        const d = distance(t.wrist, valid[i][0]);
        if (!ids.includes(j) && d < .22) visit(i + 1, [...ids, j], cost + d + (labels[i] && t.label && labels[i] !== t.label ? .07 : 0));
      });
    };
    visit(0, [], 0); assignments.sort((a, b) => a.cost - b.cost);
    const ambiguous = assignments.length > 1 && assignments[1].cost - assignments[0].cost < .025;
    let speed = 0;
    this.tracks = valid.map((h, i) => {
      const old = ambiguous ? undefined : this.tracks[assignments[0].ids[i]];
      const palmLength = Math.max(.04, distance(h[0], h[9]));
      const curled = (tip: number) => distance(h[tip], h[0]) < distance(h[tip - 2], h[0]) * 1.05 && distance(h[tip], h[tip - 3]) < palmLength * .65;
      const tips = [8, 12, 16, 20].filter(tip => !curled(tip));
      const fist = !tips.length;
      // Folded spare fingers resting against the thumb are not pinch evidence.
      const aperture = tips.length ? Math.min(...tips.map(tip => distance(h[4], h[tip]))) / palmLength : 2;
      const pinchClosed = !fist && aperture < (old?.hand.pinchClosed ? .85 : .55);
      // Keep the same landmark before and after closing: switching to the thumb
      // made the cursor jump off the target precisely when the pinch began.
      let pointer = { x: clamp(1 - h[8].x), y: clamp(h[8].y) };
      // Closing fingers moves the fingertip even when the hand stays still.
      // Keep the pre-fist cursor anchored to palm translation while closed.
      if (fist && old) pointer = { x: clamp(old.hand.pointer.x - (h[0].x - old.wrist.x)), y: clamp(old.hand.pointer.y + h[0].y - old.wrist.y) };
      if (old) speed = Math.max(speed, distance(old.hand.pointer, pointer) * 1000 / elapsed, distance(old.wrist, h[0]) * 1000 / elapsed);
      else speed = 1;
      const since = pinchClosed && old?.hand.pinchClosed ? old.since : time;
      const gripSince = (pinchClosed || fist) && old && isGripping(old.hand) ? old.gripSince : time;
      const fingers = ([8, 12, 16, 20] as const).map((tip, index) => ({
        name: (['index', 'middle', 'ring', 'little'] as const)[index], curled: curled(tip),
        extensionRatio: +Math.min(10, distance(h[tip], h[0]) / Math.max(.01, distance(h[tip - 2], h[0]))).toFixed(3),
        thumbDistancePalmLengths: +(distance(h[4], h[tip]) / palmLength).toFixed(3),
      }));
      const samples = [...(old?.samples ?? []), { time, pointer, pinchClosed, fistClosed: fist, curledFingerCount: fingers.filter(f => f.curled).length, aperture: +aperture.toFixed(3) }].filter(s => time - s.time <= 700).slice(-8);
      return { wrist: h[0], label: labels[i] || '', since, gripSince, samples, hand: {
        id: old?.hand.id ?? this.nextId++, pointer, aperture: +aperture.toFixed(3), pinchClosed, fistClosed: fist,
        pinchDurationMs: pinchClosed ? Math.min(60000, Math.round(time - since)) : 0,
        gripDurationMs: pinchClosed || fist ? Math.min(60000, Math.round(time - gripSince)) : 0,
        evidence: { handedness: labels[i] || 'unknown', palmPosition: { x: clamp(1 - h[0].x), y: clamp(h[0].y) }, fingers,
          recent: samples.filter((_, index) => index === 0 || index === samples.length - 1 || index % 2 === 0).map(({ time: seenAt, ...sample }) => ({ ...sample, ageMs: Math.round(time - seenAt) })) },
      } };

    });
    const hands = this.tracks.map(t => t.hand).sort((a, b) => a.id - b.id);
    const pointerPosition = handPointer(hands), closed = hands.filter(h => h.pinchClosed), grips = hands.filter(isGripping);
    const h = valid[this.tracks.findIndex(t => t.hand.id === hands[0]?.id)];
    const extended = (tip: number, joint: number) => !!h && distance(h[tip], h[0]) > distance(h[joint], h[0]) * 1.18;
    const indexExtended = extended(8, 6), others = [extended(12, 10), extended(16, 14), extended(20, 18)];
    const palmOpen = !!h && !closed.length && indexExtended && others.every(Boolean);
    const fist = !!h && [8, 12, 16, 20].every(tip => distance(h[tip], h[0]) < distance(h[tip - 2], h[0]) * 1.05 && distance(h[tip], h[tip - 3]) < Math.max(.04, distance(h[0], h[9])) * .65);
    const resetCycles = this.resetGesture.update(hands.length === 1 ? hands[0].id : undefined, fist ? 'fist' : palmOpen ? 'open' : 'other', time);
    const stationary = speed < .12;
    const gesture: Gesture = resetCycles === 2 ? 'double_fist' : grips.length ? 'grip_hold' : stationary && indexExtended && others.every(v => !v) ? 'point_hold' : 'unknown';
    if (gesture !== this.held || !pointerPosition || !this.anchor || distance(pointerPosition, this.anchor) > .025) { this.held = gesture; this.holdStart = time; this.anchor = pointerPosition; }
    const holdDurationMs = Math.min(60000, Math.round(time - this.holdStart));
    return { hands, resetCycles, pinchClosed: !!closed.length, pinchDurationMs: closed.length ? Math.min(...closed.map(h => h.pinchDurationMs)) : 0,
      pose: !h ? 'no_hand' : fist ? 'fist' : closed.length ? 'pinch' : palmOpen ? 'open_palm' : gesture === 'point_hold' ? 'pointing' : 'unknown',
      motion: stationary ? 'stationary' : 'general_movement', stationary, movementSpeed: speed, circularMotionScore: 0, durationMs: holdDurationMs,
      activeInteraction: closed.length ? 'pinch' : 'none', pinchDistanceChange: hands[0]?.evidence?.recent.length ? +(hands[0].aperture - hands[0].evidence.recent[0].aperture).toFixed(3) : 0, handSeparationChange: 0,
      handCount: hands.length, gesture, indexExtended, palmOpen, movementDirection: stationary ? 'stationary' : 'moving', holdDurationMs, pointerPosition };
  }
}
