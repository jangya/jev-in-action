# Jev in Action

**Small decisions. Real possibilities.**

Five interactive demos of [TypeSafe Jev](https://docs.typesafe.ai): control an object with hand gestures, categorize expenses, choose a flight, find an appointment, and route a real MCP tool call. Bring your own API key, change a prompt, and inspect what the model received and returned.

Built for developers who want to see how structured AI decisions fit into an application. A browser UI, an Express server, and a real MCP server keep each decision inspectable.

[Get started](#quick-start) · [How it works](#how-it-works) · [Roadmap](#roadmap) · [Report an issue](https://github.com/jangya/jev-in-action/issues) · [Contribute](CONTRIBUTING.md)

If this helps you learn or build something, a GitHub star is appreciated. Have another use case in mind? [Suggest a demo](https://github.com/jangya/jev-in-action/issues/new?template=feature_request.md).

![Jev in Action expense categorization workspace with prompt controls, decision trace, and inspectable model input and output](docs/jev-in-action.gif)

_The playground before a run; bring your own key to see live decisions._

## What you can try

| Use case                | Try it                                                           | What happens                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gesture web tools**   | Pinch or close a fist over the card, then move and release.      | Jev authorizes a grab; local hand tracking moves the card. Point to select, or close and open your fist twice to reset. Camera-free simulations are included. |
| **Categorize expenses** | “Treat streaming and music subscriptions as Entertainment.”      | Edit up to 20 transactions; Jev categorizes them in one API request.                                                                                          |
| **Book a flight**       | “Choose the cheapest available flight, even if it has one stop.” | Code filters a sample Bengaluru–Delhi schedule; Jev selects a match from eligible flights.                                                                    |
| **Book an appointment** | “Find a time after 3 PM.”                                        | Choose a date and service; Jev picks an available sample slot.                                                                                                |
| **Route an MCP tool**   | “Show the billing release history in staging.”                   | Jev selects a tool and arguments from a discovered catalog. You can then execute it through a real MCP client.                                                |

The expense, flight, and appointment demos include **Try another prompt** and show an action trace, a result summary, and expandable Jev request/response JSON. Gesture controls show the observed hand pose, Jev confidence, and request/response JSON. MCP routing also offers optional LLM comparison, a benchmark, saved history, and JSON export.

**Real model decisions, sample application data.** Flight schedules, appointment availability, and MCP service records are fixtures. Booking confirmations are simulated; no flight or appointment is actually booked. The MCP protocol connection and tool calls are real. The application never substitutes fake model responses when a key is missing or a provider fails.

## Quick start

You need **Node.js 22**, npm, and a TypeSafe API key with access to Jev. See the [TypeSafe documentation](https://docs.typesafe.ai) for account and API setup. An OpenRouter key is optional.

```sh
git clone https://github.com/jangya/jev-in-action.git
cd jev-in-action
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000).

1. Click **Add API key** in the header. If a server key is already present, the button says **Key configured**.
2. Paste your TypeSafe key and save. No `.env` file is required for this path.
3. Start with **Categorize expenses**, then click **Categorize expenses →**.
4. Try another prompt, edit the input, and expand **Jev input & output** to inspect the exchange.

Without a key, you can explore the interface and MCP catalog. Model calls require credentials and may incur provider charges. “Key configured” means a key is present; your first run verifies access.

### Optional: compare with an LLM

In API settings, add an **OpenRouter API key** and optionally an **OpenRouter model** ID that supports tool calling. Then open **Route an MCP tool** and enable **Compare with an LLM**.

- Jev-only routing does not call OpenRouter.
- Comparison sends the same request, tool catalog, and policy to both providers, using their respective APIs.
- Comparison selects routes; it does not execute tools. Click **Execute Jev route** or **Execute LLM route** to make one MCP call.
- The expandable **20-request benchmark** uses both providers: 40 provider calls, zero tool executions.

The other demos remain Jev-only.

### Optional: configure the server

```sh
cp .env.example .env
```

Edit `.env`, then restart your server. On Windows, you can copy the file using your editor or `Copy-Item .env.example .env` in PowerShell.

| Variable             | Purpose                           | Default                              |
| -------------------- | --------------------------------- | ------------------------------------ |
| `TYPESAFE_API_KEY`   | Server-side fallback Jev key      | Empty                                |
| `TYPESAFE_MODEL`     | Jev model                         | `jev-latest`                         |
| `OPENROUTER_API_KEY` | Optional comparison key           | Empty                                |
| `OPENROUTER_MODEL`   | Tool-calling model for comparison | `nvidia/nemotron-3.5-lightning:free` |
| `PORT`               | Local server port                 | `3000`                               |

Model availability and access depend on the provider. Change the OpenRouter model if the default is unavailable. Browser-supplied keys and the OpenRouter model override server settings for that request.

## How it works

```text
Your goal + application state
            ↓
Local Express server builds typed questions
            ↓
Jev selects from defined choices
            ↓
Code validates the result
            ↓
UI shows the decision; you confirm any demo booking or MCP execution
```

Jev supplies a structured judgment; application code owns the constraints and execution.

- **Gestures:** on-device hand tracking supplies finger measurements and recent motion alongside canvas context. Jev chooses grab, select, reset, or unclear; dragging and release run locally.
- **Expenses:** one Choice question per transaction, evaluated together.
- **Flights:** code excludes sold-out flights and enforces budget, arrival, and stop limits. Jev selects among the remaining options using your prompt, with a no-match option.
- **Appointments:** code supplies available slots for the chosen date and service. Jev selects a suitable slot or returns no match. Times are IST.
- **MCP:** the server discovers five tools via `tools/list`. Jev selects the tool, service, and environment. The application validates those values before a user-triggered `tools/call`.

The MCP tools are `get_service_health`, `list_incidents`, `list_deployments`, `get_runbook`, and `list_feature_flags`. They accept `auth`, `billing`, or `search`, in `production` or `staging`. Unsupported requests can return `no_tool`.

For payload design, execution guarantees, and benchmark interpretation, read the [architecture notes](docs/architecture.md).

## Keys, data, and hosting

- UI keys use **sessionStorage** by default. **Remember on this device** switches to **localStorage**, which persists after closing the browser. Both are browser storage, not encrypted credential vaults.
- Keys travel through the app server to the selected provider. They are not intentionally included in model payloads, saved results, or exports. Prompts and application state are sent to the provider.
- **Clear saved keys** removes browser keys; any `.env` keys still apply.
- When running locally, MCP routing records and execution results persist in `.data/events.jsonl`, including request text and successful provider responses. JSON exports contain those records. The other demos do not write results to that journal.
- Camera frames and full hand landmarks stay on-device; derived gesture observations go to Jev. Camera use needs HTTPS or localhost and permission. Tracking accuracy depends on lighting and hand visibility; initial actions still wait for Jev.
- `.env`, `.data/`, dependencies, and generated test artifacts are ignored by Git. Never paste credentials into prompts, issues, or screenshots.

## Deploy on Vercel

Import this repository into Vercel with **Express** as the Framework Preset and the repository root as the Root Directory. Use `npm ci` for installation; use the repository’s `npm run build` Build Command and leave Output Directory at its default. The root `app.js` is the hosted entry point. `vercel.json` configures a 60-second function limit, security headers, and the Express preset. Node.js is pinned to 22.x.

**No provider environment variables are required.** Visitors enter their own keys in the UI. Hosted code ignores deployment-level API keys; optional `TYPESAFE_MODEL` and `OPENROUTER_MODEL` variables can set model defaults.

Hosted behavior differs from local development:

- History and export belong to the visitor's browser session (up to 100 saved runs). There is no shared server journal or database. Closing the session clears history; export anything you want to keep.
- The official MCP client and server exchange JSON-RPC messages through the SDK's in-process transport. Local development still uses a subprocess with stdio. Both discover and execute the same read-only fixture tools. Neither connects to live infrastructure.
- The benchmark makes one server request per case, keeping each request within the function duration instead of holding one long stream open.
- Hosted execution validates a read-only tool selection submitted by the browser. It has no durable server-side single-execution guarantee or proof that a model selected that call. The UI prevents accidental repeated execution within its saved session. Direct API callers can repeat these harmless sample reads. Do not replace the fixtures with side-effecting tools without adding server-side authorization and durable execution controls.
- Keys pass through the function to the provider and are not written to server storage. Enable Vercel firewall and spend controls appropriate to your traffic; BYOK avoids shared provider charges but hosting resources can still be consumed.

`npm run dev` continues to use the local entry point and file journal. The shared local journal must not be exposed as a public service.

## Development

```sh
npm run typecheck
npm run build
npm test

# Install Chromium once if Google Chrome is not available on macOS:
npx playwright install chromium
npm run test:browser
npm run test:hosted
```

Tests use synthetic provider responses, so no API keys or paid model calls are needed. Browser tests start their own temporary local test server, exercise real MCP calls, and save screenshots to `test-artifacts/`. They do not verify live model quality. CI runs backend and browser checks on Node.js 22.

Implementation guidance, the stack, and the file map live in [AGENTS.md](AGENTS.md).

### Troubleshooting

| Problem                          | Try this                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run dev` fails              | Check `node --version` (22+) and run `npm ci`.                                                                     |
| Port already in use              | Choose another `PORT` in `.env`, or use your existing server.                                                      |
| Key configured, but a run fails  | Check key validity, model access, quota, and the displayed provider error.                                         |
| No flight or appointment matches | Relax the goal or controls; a no-match result is supported.                                                        |
| Benchmark button disabled        | Configure both TypeSafe and OpenRouter keys.                                                                       |
| Browser changes are missing      | Run `npm run build`, restart your server, and refresh after gesture/backend changes; restart after `.env` changes. |

## Roadmap

These are proposed directions, not delivery commitments. [Open an issue](https://github.com/jangya/jev-in-action/issues/new?template=feature_request.md) to help prioritize them.

- [ ] More contributed demos with small, inspectable decision flows.
- [ ] A larger routing evaluation set, including ambiguous and unsupported requests.
- [ ] Optional MCP adapters backed by live services.
- [ ] A short walkthrough video and more examples of good no-match behavior.
- [x] Vercel-compatible BYOK demos with session-local history.
- [ ] Additional abuse controls and optional durable, authenticated tool integrations.

Found a bug? [Report it](https://github.com/jangya/jev-in-action/issues/new?template=bug_report.md). Want to build on the project? Read [CONTRIBUTING.md](CONTRIBUTING.md). Small fixes, documentation improvements, and thoughtful demo ideas are welcome.

## License and credits

[MIT](LICENSE) · Built by [jangya](https://github.com/jangya).

Uses [TypeSafe Jev](https://docs.typesafe.ai), the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk), and optional [OpenRouter](https://openrouter.ai/docs) comparison. This is an independent community demo, not an official product of those providers.
