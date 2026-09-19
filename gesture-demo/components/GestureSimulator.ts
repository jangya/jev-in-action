import { gestureLabels, type Gesture, type Observation } from '../types.js';
export const simulations: Observation[] = [
  { pose: 'unknown', motion: 'general_movement', stationary: false, movementSpeed: .34, circularMotionScore: .12, durationMs: 450, activeInteraction: 'none', pinchDistanceChange: .02, handSeparationChange: 0, handCount: 1, gesture: 'unknown', indexExtended: false, palmOpen: false, movementDirection: 'moving', holdDurationMs: 700 },
  { pose: 'pointing', motion: 'stationary', stationary: true, movementSpeed: .01, circularMotionScore: 0, durationMs: 650, activeInteraction: 'none', pinchDistanceChange: .01, handSeparationChange: 0, handCount: 1, gesture: 'point_hold', indexExtended: true, palmOpen: false, movementDirection: 'stationary', holdDurationMs: 650, pointerPosition: { x: .5, y: .5 } },
  { pose: 'open_palm', motion: 'stationary', stationary: true, movementSpeed: .01, circularMotionScore: 0, durationMs: 800, activeInteraction: 'none', pinchDistanceChange: .01, handSeparationChange: 0, handCount: 1, gesture: 'double_fist', resetCycles: 2, indexExtended: true, palmOpen: true, movementDirection: 'stationary', holdDurationMs: 800 },
];
export function createSimulator(root: HTMLElement, onSelect: (observation: Observation) => void) {
  const icons = ['?', '◎', '✋'];
  const notes = ['Random or ambiguous hand movement', 'Aim, then pause for a moment', 'Make a fist and open it, twice'];
  simulations.forEach((observation, i) => {
    const button = document.createElement('button'); button.className = 'simulation-card'; button.dataset.gesture = observation.gesture;
    button.innerHTML = `<span class="gesture-icon" aria-hidden="true">${icons[i]}</span><strong>${observation.gesture === 'unknown' ? 'Unclear movement' : gestureLabels[observation.gesture as Gesture]}</strong><small>${notes[i]}</small>`;
    button.addEventListener('click', () => onSelect(structuredClone(observation))); root.append(button);
  });
}
