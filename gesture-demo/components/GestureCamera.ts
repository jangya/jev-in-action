import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { Observation } from '../types.js';
import { GestureExtractor } from '../gesture/extractGestureFeatures.js';
export class GestureCamera {
  private stream?: MediaStream;
  private detector?: HandLandmarker;
  private frame = 0;
  private generation = 0;
  private extractor = new GestureExtractor();
  private running = false;
  private lastTime = -1;
  private lastFrame = 0;
  constructor(private video: HTMLVideoElement, private overlay: HTMLCanvasElement, private button: HTMLButtonElement, private status: HTMLElement, private onObservation: (observation: Observation) => void, private onStop: () => void) {
    button.addEventListener('click', () => this.running ? this.stop() : void this.start());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    window.addEventListener('pagehide', () => this.stop());
  }
  async start() {
    const generation = ++this.generation;
    this.button.disabled = true; this.status.textContent = 'Loading hand tracking…';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs HTTPS or localhost and a supported browser.');
      const { createHandLandmarker } = await import('../gesture/handLandmarker.js');
      const detector = await createHandLandmarker();
      if (generation !== this.generation) { detector.close(); return; }
      this.detector = detector;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      stream.getVideoTracks()[0].addEventListener('ended', () => this.stop());
      this.running = true; this.lastTime = -1; this.button.textContent = 'Stop camera';
      this.status.textContent = 'Live · hold a gesture, then relax to repeat';
      this.loop(performance.now());
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.status.textContent = `${error instanceof Error ? error.message : 'Camera unavailable.'} Simulation cards still work.`;
    } finally { if (generation === this.generation || !this.running) this.button.disabled = false; }
  }
  stop() {
    ++this.generation; this.running = false; cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = undefined;
    this.video.srcObject = null; this.detector?.close(); this.detector = undefined;
    this.extractor.reset(); this.overlay.getContext('2d')?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.button.textContent = 'Enable camera'; this.button.disabled = false; this.status.textContent = 'Camera off · simulations ready'; this.onStop();
  }
  private loop = (time: number) => {
    if (!this.running || !this.detector) return;
    try {
      // Cap synchronous inference at 12 fps and skip duplicate video frames.
      if (time - this.lastFrame > 83 && this.video.readyState >= 2 && this.lastTime !== this.video.currentTime) {
        this.lastFrame = time; this.lastTime = this.video.currentTime;
        const result = this.detector.detectForVideo(this.video, time);
        const context = this.overlay.getContext('2d')!;
        this.overlay.width = this.video.videoWidth; this.overlay.height = this.video.videoHeight;
        context.strokeStyle = '#8affce'; context.fillStyle = '#fff'; context.lineWidth = 2;
        for (const hand of result.landmarks) {
          for (const chain of [[0,1,2,3,4], [0,5,6,7,8], [5,9,10,11,12], [9,13,14,15,16], [13,17,18,19,20], [0,17]]) {
            context.beginPath(); chain.forEach((index, i) => { const p = hand[index]; if (i) context.lineTo(p.x * this.overlay.width, p.y * this.overlay.height); else context.moveTo(p.x * this.overlay.width, p.y * this.overlay.height); }); context.stroke();
          }
          for (const p of hand) { context.beginPath(); context.arc(p.x * this.overlay.width, p.y * this.overlay.height, 3, 0, Math.PI * 2); context.fill(); }
        }
        this.onObservation(this.extractor.extract(result.landmarks, time, result.handedness.map(h => h[0]?.categoryName || '')));
      }
      this.frame = requestAnimationFrame(this.loop);
    } catch { this.stop(); this.status.textContent = 'Hand tracking stopped. Try again or use the simulation cards.'; }
  };
}
