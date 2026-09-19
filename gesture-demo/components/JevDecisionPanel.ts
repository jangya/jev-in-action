import { poseLabels, motionLabels, toolInfo, type Decision, type Observation } from '../types.js';
const text = (id: string, value: string) => { document.getElementById(id)!.textContent = value; };
export function showObservation(observation: Observation) { text('observed-pose', poseLabels[observation.pose]); text('observed-motion', motionLabels[observation.motion]); text('observation-json', JSON.stringify(observation, null, 2)); }
export function showDecision(decision: Decision) {
  text('inferred-intent', decision.intent); text('selected-tool', decision.tool ? toolInfo[decision.tool].label : 'No action');
  text('confidence-value', decision.confidence === null ? 'Unavailable' : `${Math.round(decision.confidence * 100)}%`);
  const progress = document.getElementById('confidence') as HTMLProgressElement;
  progress.value = decision.confidence ?? 0; progress.hidden = decision.confidence === null;
  text('decision-meta', `${decision.model} · ${decision.latencyMs} ms`);
  text('model-input', JSON.stringify(decision.providerPayload, null, 2)); text('model-output', JSON.stringify(decision.rawResponse, null, 2));
}
export function clearDecision() {
  for (const id of ['inferred-intent', 'selected-tool', 'confidence-value']) text(id, '—');
  (document.getElementById('confidence') as HTMLProgressElement).value = 0;
  text('decision-meta', 'Waiting for JEV'); text('model-input', 'Waiting for response.'); text('model-output', 'Waiting for response.');
}
