import { hasGrip } from '../types.js';
import type { Point, ToolName, Observation } from '../types.js';
export const target = { x: 600, y: 200, halfSize: 85 };
export interface CanvasState { zoom: number; rotation: number; selected: string | null; rotations: Record<string, number>; position: Point; dragging: boolean; offset: Point; completed: boolean }
export const initialState = (): CanvasState => ({ zoom: 1, rotation: 0, selected: null, rotations: { card: 0 }, position: { x: 230, y: 200 }, dragging: false, offset: { x: 0, y: 0 }, completed: false });
export const screenPoint = (p: Point): Point => ({ x: p.x * 800, y: p.y * 400 });
export function hitsObject(pointer: Point, state: CanvasState): boolean {
  const p = screenPoint(pointer), angle = -(state.rotation + state.rotations.card) * Math.PI / 180;
  const x = (p.x - state.position.x) / state.zoom, y = (p.y - state.position.y) / state.zoom;
  return Math.abs(x * Math.cos(angle) - y * Math.sin(angle)) <= 55 && Math.abs(x * Math.sin(angle) + y * Math.cos(angle)) <= 55;
}
export const canvasTools: Record<ToolName, (state: CanvasState, observation: Observation) => void> = {
  select: (state, observation) => { if (observation.pointerPosition && hitsObject(observation.pointerPosition, state)) state.selected = 'card'; },
  drag: (state, observation) => {
    if (!hasGrip(observation) || !observation.pointerPosition || !hitsObject(observation.pointerPosition, state)) return;
    const p = screenPoint(observation.pointerPosition);
    state.offset = { x: state.position.x - p.x, y: state.position.y - p.y };
    state.dragging = true; state.selected = 'card'; state.completed = false;
  },
  unclear: () => {},
  reset: state => { Object.assign(state, initialState()); },
};
