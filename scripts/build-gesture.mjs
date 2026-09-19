import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/generated', { recursive: true });
await build({ entryPoints: ['gesture-demo/main.ts'], bundle: true, format: 'esm', splitting: true, outdir: 'public/generated', entryNames: 'gesture', target: 'es2022' });
await build({ entryPoints: ['gesture-demo/jev/gestureDecision.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: 'dist/gestureDecision.js' });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/generated/wasm', { recursive: true });
