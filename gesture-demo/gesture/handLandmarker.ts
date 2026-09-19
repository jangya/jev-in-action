import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
export async function createHandLandmarker() {
  const files = await FilesetResolver.forVisionTasks('/generated/wasm');
  return HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
    runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6, minTrackingConfidence: .6,
  });
}
