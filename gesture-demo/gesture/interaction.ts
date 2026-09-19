import { isGripping, type TrackedHand } from '../types.js';
import type { GestureCanvas } from '../components/GestureCanvas.js';
export const grabKey = (hands: TrackedHand[]) => hands.filter(isGripping).map(h => h.id).sort((a, b) => a - b).join(',');
export class Interaction {
  private owner?: number;
  constructor(private canvas: GestureCanvas) {}
  start(hands: TrackedHand[]) { this.owner = hands.find(isGripping)?.id; }
  cancel() { this.owner = undefined; this.canvas.end(false); }
  update(hands: TrackedHand[]) {
    const owner = hands.find(h => h.id === this.owner);
    if (!owner) { this.cancel(); return; }
    if (!isGripping(owner)) { this.canvas.end(true); this.owner = undefined; return; }
    this.canvas.move(owner.pointer);
  }
}
