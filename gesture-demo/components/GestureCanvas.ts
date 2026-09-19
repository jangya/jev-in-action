import { initialState, canvasTools, hitsObject, screenPoint, target } from '../tools/canvasTools.js';
import type { Observation, ToolName, Point } from '../types.js';
export class GestureCanvas {
  state = initialState();
  private displayed = { ...this.state.position };
  private frame = 0;
  private previousTime = 0;
  constructor(private svg: SVGSVGElement, private summary: HTMLElement) { this.render(); }
  execute(tool: ToolName, observation: Observation) {
    if (tool === 'drag') this.state.position = { ...this.displayed };
    canvasTools[tool](this.state, observation);
    if (tool === 'reset') { cancelAnimationFrame(this.frame); this.frame = 0; this.displayed = { ...this.state.position }; }
    this.render();
  }
  hits(point: Point) { return hitsObject(point, { ...this.state, position: this.displayed }); }
  context(point?: Point) { return { pointerOverObject: !!point && this.hits(point), dragging: this.state.dragging, object: { position: this.state.position, zoom: this.state.zoom, rotation: this.state.rotation + this.state.rotations.card, selected: !!this.state.selected }, target: { ...target, completed: this.state.completed } }; }
  pointer(point?: Point) {
    const marker = this.svg.querySelector<SVGCircleElement>('#pointer')!;
    marker.setAttribute('visibility', point ? 'visible' : 'hidden');
    if (point) { marker.setAttribute('cx', String(point.x * 800)); marker.setAttribute('cy', String(point.y * 400)); }
    this.svg.querySelector('#object-card')!.classList.toggle('is-hovered', !!point && this.hits(point));
  }
  move(point: Point) {
    if (!this.state.dragging) return;
    const p = screenPoint(point);
    const angle = (this.state.rotation + this.state.rotations.card) * Math.PI / 180;
    const margin = 55 * this.state.zoom * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
    this.state.position = { x: Math.max(margin, Math.min(800 - margin, p.x + this.state.offset.x)), y: Math.max(margin, Math.min(400 - margin, p.y + this.state.offset.y)) };
    if (!this.frame) { this.previousTime = performance.now(); this.frame = requestAnimationFrame(this.animate); }
  }
  end(acceptDrop: boolean) {
    if (!this.state.dragging) return;
    cancelAnimationFrame(this.frame); this.frame = 0;
    if (!acceptDrop) this.state.position = { ...this.displayed };
    const p = this.state.position;
    this.state.completed = acceptDrop && Math.abs(p.x - target.x) <= target.halfSize && Math.abs(p.y - target.y) <= target.halfSize;
    if (this.state.completed) this.state.position = { x: target.x, y: target.y };
    this.state.dragging = false; this.displayed = { ...this.state.position }; this.render();
  }
  private animate = (now: number) => {
    const alpha = 1 - Math.exp(-(now - this.previousTime) / 35); this.previousTime = now;
    this.displayed.x += (this.state.position.x - this.displayed.x) * alpha;
    this.displayed.y += (this.state.position.y - this.displayed.y) * alpha;
    this.render();
    if (Math.hypot(this.displayed.x - this.state.position.x, this.displayed.y - this.state.position.y) > .2) this.frame = requestAnimationFrame(this.animate);
    else { this.frame = 0; this.displayed = { ...this.state.position }; this.render(); }
  };
  private render() {
    const s = this.state, object = this.svg.querySelector('#object-card')!;
    object.setAttribute('transform', `translate(${this.displayed.x} ${this.displayed.y}) rotate(${s.rotation + s.rotations.card}) scale(${s.zoom})`);
    object.querySelector('text')!.setAttribute('visibility', s.selected ? 'hidden' : 'visible');
    object.classList.toggle('is-selected', !!s.selected); object.classList.toggle('is-dragging', s.dragging);
    this.svg.querySelector('#drop-target')!.classList.toggle('is-complete', s.completed);
    this.svg.querySelector('#target-label')!.textContent = s.completed ? 'Placed ✓' : 'Drop here';
    this.summary.textContent = `${Math.round(s.zoom * 100)}% zoom · ${s.rotation + s.rotations.card}° · ${s.dragging ? 'Dragging' : s.completed ? 'Target complete' : s.selected ? 'Card selected' : 'Nothing selected'}`;
  }
}
