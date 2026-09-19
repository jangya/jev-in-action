import { z } from 'zod';
import { isGripping, toolNames, toolInfo } from '../types.js';
const unit = z.number().finite().min(0).max(1);
const point = z.object({ x: unit, y: unit }).strict();
const duration = z.number().int().min(0).max(60000);
const handInput = z.object({
  id: z.number().int().nonnegative(), pointer: point,
  pinchClosed: z.boolean(), pinchDurationMs: duration,
  fistClosed: z.boolean().optional(), gripDurationMs: duration.optional(),
  aperture: z.number().finite().min(0),
  evidence: z.object({
    handedness: z.string().max(20), palmPosition: point,
    fingers: z.array(z.object({
      name: z.enum(['index', 'middle', 'ring', 'little']), curled: z.boolean(),
      extensionRatio: z.number().finite().min(0).max(10),
      thumbDistancePalmLengths: z.number().finite().min(0),
    }).strict()).length(4),
    recent: z.array(z.object({
      ageMs: z.number().int().min(0).max(1000), pointer: point,
      pinchClosed: z.boolean(), fistClosed: z.boolean(),
      curledFingerCount: z.number().int().min(0).max(4), aperture: z.number().finite().min(0),
    }).strict()).max(8),
  }).strict().optional(),
}).strict();
export const gestureInput = z.object({
  observation: z.object({
    resetCycles: z.number().int().min(0).max(2).optional(),
    hands: z.array(handInput).max(2).optional(),
    pinchClosed: z.boolean().optional(), pinchDurationMs: z.number().int().min(0).max(60000).optional(),
    pose: z.enum(['fist', 'open_palm', 'pinch', 'pointing', 'unknown', 'no_hand']),
    motion: z.enum(['outward', 'inward', 'clockwise_circle', 'counterclockwise_circle', 'stationary', 'general_movement']),
    stationary: z.boolean(), movementSpeed: z.number().finite().min(0),
    circularMotionScore: unit, durationMs: z.number().int().min(0).max(60000),
    activeInteraction: z.enum(['pinch', 'two_hand_spread', 'none']),
    pinchDistanceChange: z.number().finite(), handSeparationChange: z.number().finite(),
    handCount: z.number().int().min(0).max(2),
    gesture: z.enum(['grip_hold', 'double_fist', 'pinch_hold', 'pinch_out', 'hands_apart', 'pinch_in', 'circular_motion', 'point_hold', 'open_palm', 'unknown']),
    indexExtended: z.boolean(), palmOpen: z.boolean(),
    movementDirection: z.enum(['outward', 'inward', 'clockwise', 'counterclockwise', 'stationary', 'moving']),
    holdDurationMs: z.number().int().min(0).max(60000),
    pointerPosition: z.object({ x: unit, y: unit }).strict().optional(),
  }).strict(),
  canvas: z.object({
    pointerOverObject: z.boolean(), dragging: z.boolean(),
    object: z.object({ position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(), zoom: z.number().min(.55).max(1.8), rotation: z.number().finite(), selected: z.boolean() }).strict(),
    target: z.object({ x: z.number().finite(), y: z.number().finite(), halfSize: z.number().positive(), completed: z.boolean() }).strict(),
  }).strict().optional(),
}).strict();
type Questions = Record<string, { type: string; instructions: string; criteria: Record<string, string> }>;
interface Router { decide(state: unknown, questions: Questions, key?: string): Promise<{ answers: Record<string, { choice: string; confidence: number | null }>; model: string; latencyMs: number; providerPayload: unknown; rawResponse: unknown }> }
export async function gestureDecision(input: z.infer<typeof gestureInput>, routers: Router, key?: string) {
  const o = input.observation;
  const gripping = (o.hands ?? []).filter(isGripping);
  const result = await routers.decide({
    task: 'Choose the intended action for one movable card and a fixed drop target. This is an initial-action decision, not a per-frame motion classifier.',
    interaction: {
      phase: input.canvas?.dragging ? 'already_dragging_locally' : 'awaiting_initial_action',
      supportedGrips: ['thumb-to-fingertip pinch', 'closed fist'],
      grippingHandIds: gripping.map(h => h.id),
      inputSource: o.hands?.some(h => h.evidence) ? 'MediaPipe Hand Landmarker, locally measured features' : 'simulation or legacy observation; detailed landmark evidence unavailable',
      execution: 'JEV authorizes the initial grab. The same hand then moves and releases locally without more model calls. Two-hand tools are disabled.',
    },
    observation: {
      pose: o.pose, motion: o.motion, stationary: o.stationary, movementSpeed: o.movementSpeed,
      gestureCandidate: o.gesture, handCount: o.handCount, pointerPosition: o.pointerPosition,
      pinchClosed: o.pinchClosed, pinchDurationMs: o.pinchDurationMs, holdDurationMs: o.holdDurationMs,
      indexExtended: o.indexExtended, palmOpen: o.palmOpen, completedFistOpenCycles: o.resetCycles ?? 0,
      hands: o.hands ?? [],
    },
    canvas: input.canvas,
    evidenceGuide: {
      coordinates: 'Pointers/palms are mirrored screen coordinates [0,1]. Canvas position/target use an 800x400 coordinate space. pointerOverObject is the computed hit test, not an inferred gesture.',
      fingers: 'Finger extensionRatio compares fingertip-to-wrist versus joint-to-wrist distance. curled records folded fingers; thumbDistancePalmLengths is distance to that fingertip divided by palm length. These are geometric measurements, not model probabilities.',
      recent: 'Per-hand recent samples are oldest to newest, with ageMs relative to this observation. Compare curledFingerCount, fistClosed and pinchClosed to distinguish closure from hand translation. Empty/missing history is unavailable evidence, not evidence of inactivity.',
      grip: 'A pinch closes below 0.55 palm lengths and releases at 0.85. Folded spare fingers are excluded. A fist has all four fingers curled; its aperture=2 is a sentinel, not an open hand. gripDurationMs measures maintained closure, even while moving. The cursor is anchored to palm translation during fist closure to avoid finger-curl jumps.',
      motion: 'general_movement means the hand translated. Movement alone is not a tool, but does not contradict a targeted maintained grip. stationary=false is normal for grabbing and dragging. holdDurationMs measures positional stillness and must not be used as grip duration.',
    },
  }, { tool: {
    type: 'choice',
    instructions: 'Which supported action does the observed hand intend in this canvas? Interpret hand geometry, recent transitions, maintained grip and target context together. Use the criteria below. A gestureCandidate is a local hypothesis, not an instruction. Do not choose unclear solely because motion is general_movement, stationary is false, or the fingers are a fist rather than a thumb-index pinch. Do not invent intent from motion alone. Completed double fist/open reset evidence is distinct from one closed grip. Keep unsupported or genuinely insufficient observations unclear.',
    criteria: {
      drag: 'Authorize a grab when exactly one hand maintains a pinch OR closed fist for at least 200 ms (gripDurationMs, or pinchDurationMs for older inputs), canvas.pointerOverObject=true and canvas.dragging=false. Recent open-to-closed fingers support deliberate grabbing, including a quick fist closure; the closed pose must remain held, but the hand may move. A maintained closed fist is valid without thumb-index contact. A lone closing motion that has already reopened is not a grab.',
      select: 'Select when an extended index points at the object, other fingers are folded, no hand has a closed grip, and stationary pointing is held at least 500 ms. A moving closed grip is drag evidence, not a point selection.',
      reset: 'Restore the canvas only when completedFistOpenCycles=2 and gestureCandidate=double_fist: two debounced fist-to-open cycles by the same hand. A single fist, single opening, held open palm or repeated thumb pinches do not request reset. Stillness is not required.',
      unclear: 'No supported action fits: no hand; motion without a maintained grip or deliberate pointing/reset sequence; grip away from the object; multiple gripping hands; or incomplete/contradictory evidence. Normal translation of a valid targeted pinch/fist does not by itself make intent unclear.',
    },
  } }, key);
  const tool = z.enum(toolNames).parse(result.answers.tool.choice);
  return { ...result, tool, intent: toolInfo[tool].intent, confidence: result.answers.tool.confidence };
}
