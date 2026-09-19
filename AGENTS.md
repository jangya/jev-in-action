# Repository guide

## Stack and layout

Use the existing stack: Node.js 22, npm, ES modules, Express 5, Zod, and the
Model Context Protocol SDK. Most browser code is plain JavaScript; the gesture
demo uses TypeScript, esbuild, and MediaPipe Tasks Vision. Playwright provides
browser verification. Keep the README focused on trying the five use cases.

| Path | Responsibility |
| --- | --- |
| `public/` | Pages, styles, sample data, and browser credential settings |
| `public/navigation.js` | Shared use-case registry and sidebar |
| `gesture-demo/main.ts` | Gesture requests, cooldown, pending input, simulation wiring |
| `gesture-demo/gesture/` | Landmark features, stable hand identities, reset sequence, local grab lifecycle |
| `gesture-demo/jev/gestureDecision.ts` | Strict request schema, Jev context and Choice criteria |
| `gesture-demo/components/` | Camera lifecycle, SVG canvas, controls, decision display |
| `gesture-demo/tools/canvasTools.ts` | Validated local canvas operations and hit-testing |
| `scripts/build-gesture.mjs` | Browser/server bundles and local MediaPipe WASM assets |
| `server/demo.js` | Expense, flight, and appointment workflows |
| `server/routers.js` | Jev and optional OpenRouter adapters |
| `server/mcp-*.js` | MCP server/client and fixture tools |
| `server/experiment.js` | Routing comparisons and local execution records |
| `server/dataset.js` | Labeled MCP routing examples |
| `server/index.js` / `app.js` | Local / hosted entry points |
| `test/` | Existing backend, browser, and hosted checks |

## Development and deployment

- Install with `npm ci`; run locally with `npm run dev`.
- Check changes with `npm run typecheck`, `npm run build`, and `npm test`.
  For browser changes, run `npm run test:browser` and `npm run test:hosted`.
- The predev/prestart/pretest scripts build the gesture modules. Rebuild after
  TypeScript edits and restart the server: the server imports the generated
  decision module once at startup. Refresh the page for new browser bundles.
- `dist/` and `public/generated/` are generated and ignored. Never commit them.
- Vercel uses the Express preset, root `app.js`, and `npm run build` from
  `vercel.json`. Preserve the gesture page's WASM/model-download CSP exceptions.
- Register new demos in `public/navigation.js`; see `CONTRIBUTING.md` for layout.
- Reuse `.agents/skills/typesafe-ai/SKILL.md` for TypeSafe integration work.

## Gesture interaction invariants

- Jev authorizes the initial action. Its choices are `drag`, `select`, `reset`,
  and `unclear`. Do not force actions by suppressing unclear probabilities.
- One maintained pinch or fist over the card can request a grab after 200 ms.
  Movement does not invalidate grip duration. Pinch distance is normalized by
  palm length: close below 0.55, release at 0.85; ignore folded spare fingers.
- Preserve the gripping hand's identity. Finger closure must not make the cursor
  jump: a fist uses palm translation from the preceding cursor position.
- After authorization, movement/release are local. No two-hand grabbing, resizing,
  or standalone zoom/rotation gestures. Opening the owner drops the card.
- Reset requires two fist-to-open cycles from the same hand within 3 seconds,
  with each phase stable for 100 ms. An open palm alone never resets.
- Keep one request in flight, a 1.8-second camera cooldown, one refreshed pending
  observation, and 350 ms release/re-arm. Discard stale observations and decisions.
- Tracking loss, a frame gap over 250 ms, the 300 ms watchdog, camera stop, hidden
  page, or input-source switch cancels safely without claiming a successful drop.
- The fixed target checks the card center, then snaps it to the target center.
- Send compact finger measurements, stable IDs, grip duration, recent history
  (up to 700 ms), and canvas context to Jev. Full landmarks/frames stay on-device.
  Geometry and pose candidates are evidence, not model confidence or commands.
- Preserve native Jev confidence and the exact request/response inspector.
  Simulations provide observations and still use real Jev authorization.

## Verification and data boundaries

Do not add dependencies or unit tests merely for a reversible UI change. Use
existing checks and browser verification appropriate to the change. Synthetic
landmarks and provider fixtures verify plumbing and local behavior, not physical
camera accuracy or live Jev decision quality. Report those limits honestly.

Keep credentials, `.env`, `.data/`, and generated test artifacts out of commits.
Hosted visitors supply their own keys; hosted history is session-local. Preserve
fixture labels for bookings and MCP records. Never invent live model confidence,
latency, or successful deployment status.
