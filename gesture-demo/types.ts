export const toolNames = ['select', 'reset', 'unclear', 'drag'] as const;
export type ToolName = typeof toolNames[number];
export type Point = { x: number; y: number };
export type Gesture = 'grip_hold' | 'double_fist' | 'pinch_hold' | 'pinch_out' | 'hands_apart' | 'pinch_in' | 'circular_motion' | 'point_hold' | 'open_palm' | 'unknown';
export type Pose = 'fist' | 'open_palm' | 'pinch' | 'pointing' | 'unknown' | 'no_hand';
export type Motion = 'outward' | 'inward' | 'clockwise_circle' | 'counterclockwise_circle' | 'stationary' | 'general_movement';
export interface HandSample { ageMs: number; pointer: Point; pinchClosed: boolean; fistClosed: boolean; curledFingerCount: number; aperture: number }
export interface TrackedHand {
  id: number; pointer: Point; pinchClosed: boolean; pinchDurationMs: number; aperture: number;
  fistClosed?: boolean; gripDurationMs?: number;
  evidence?: {
    handedness: string; palmPosition: Point;
    fingers: { name: 'index' | 'middle' | 'ring' | 'little'; curled: boolean; extensionRatio: number; thumbDistancePalmLengths: number }[];
    recent: HandSample[];
  };
}
export const isGripping = (hand: TrackedHand) => hand.pinchClosed || hand.fistClosed === true;
export const hasGrip = (observation: Observation) => (observation.hands ?? []).some(isGripping);
export interface Observation {
  hands?: TrackedHand[];
  resetCycles?: number;
  pinchClosed?: boolean; pinchDurationMs?: number;
  pose: Pose; motion: Motion; stationary: boolean;
  /** Screen-normalized distance per second; not a confidence value. */
  movementSpeed: number;
  /** Geometric evidence score, not JEV model confidence. */
  circularMotionScore: number; durationMs: number;
  activeInteraction: 'pinch' | 'two_hand_spread' | 'none';
  pinchDistanceChange: number; handSeparationChange: number;
  handCount: number; gesture: Gesture; indexExtended: boolean; palmOpen: boolean;
  movementDirection: 'outward' | 'inward' | 'clockwise' | 'counterclockwise' | 'stationary' | 'moving';
  holdDurationMs: number; pointerPosition?: Point;
}
export interface Decision { tool: ToolName | null; intent: string; confidence: number | null; model: string; latencyMs: number; providerPayload: unknown; rawResponse: unknown }
export const toolInfo: Record<ToolName, { label: string; intent: string }> = {
  drag: { label: 'Drag', intent: 'Grab the targeted object with a pinch or closed fist for local dragging' },
  select: { label: 'Select', intent: 'Select the object nearest the pointer' },
  unclear: { label: 'Unclear', intent: 'No clear supported intent; leave the canvas unchanged' },
  reset: { label: 'Reset', intent: 'Restore the initial canvas' },
};
export const gestureLabels: Record<Gesture, string> = { grip_hold: 'Closed grip + hold', double_fist: 'Close + open twice', pinch_hold: 'Pinch + hold', pinch_out: 'Pinch outward', hands_apart: 'Two hands moving apart', pinch_in: 'Pinch inward', circular_motion: 'Circular finger motion', point_hold: 'Point + hold', open_palm: 'Open palm', unknown: 'Waiting for a clear gesture' };

export const poseLabels: Record<Pose, string> = { fist: 'Fist', open_palm: 'Open palm', pinch: 'Pinch', pointing: 'Pointing', unknown: 'Unclear hand pose', no_hand: 'No hand detected' };
export const motionLabels: Record<Motion, string> = { outward: 'Outward motion', inward: 'Inward motion', clockwise_circle: 'Clockwise circular motion', counterclockwise_circle: 'Counter-clockwise circular motion', stationary: 'Stationary', general_movement: 'General movement' };
