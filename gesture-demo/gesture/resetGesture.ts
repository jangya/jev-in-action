/** Two debounced fist → open cycles from the same tracked hand, within 3 s. */
export class ResetGesture {
  private handId?: number;
  private candidate = '';
  private candidateSince = 0;
  private stable = '';
  private cycles = 0;
  private started = 0;
  private closed = false;
  private completed = -Infinity;
  reset() { this.handId = undefined; this.candidate = this.stable = ''; this.cycles = 0; this.closed = false; this.completed = -Infinity; }
  update(id: number | undefined, pose: 'fist' | 'open' | 'other', now: number) {
    if (id === undefined || id !== this.handId) { this.reset(); this.handId = id; }
    if (id === undefined) return 0;
    if (this.cycles || this.closed) {
      if (now - this.started > 3000) { this.cycles = 0; this.closed = false; this.stable = ''; }
    }
    if (pose !== this.candidate) { this.candidate = pose; this.candidateSince = now; }
    if (pose !== 'other' && now - this.candidateSince >= 100 && pose !== this.stable) {
      this.stable = pose;
      if (pose === 'fist') {
        if (!this.cycles) this.started = now;
        this.closed = true; this.completed = -Infinity;
      } else if (this.closed) {
        this.closed = false;
        if (++this.cycles === 2) { this.completed = now; this.cycles = 0; }
      }
    }
    // Keep the completed evidence fresh through the existing API cooldown.
    return pose === 'open' && now - this.completed <= 2200 ? 2 : 0;
  }
}
