# Jev in Action

**Small decisions. Real possibilities.**

Five interactive demos of [TypeSafe Jev](https://docs.typesafe.ai): control an object with hand gestures, categorize expenses, choose a flight, find an appointment, and compare LLM tool selection with Jev progressive disclosure. Bring your own API key, change a prompt, and inspect what the model received and returned.

Built for developers who want to see how structured AI decisions fit into an application. A browser UI and Express server keep each decision inspectable.

[Get started](#quick-start) · [How it works](#how-it-works) · [Roadmap](#roadmap) · [Report an issue](https://github.com/jangya/jev-in-action/issues) · [Contribute](CONTRIBUTING.md)

If this helps you learn or build something, a GitHub star is appreciated. Have another use case in mind? [Suggest a demo](https://github.com/jangya/jev-in-action/issues/new?template=feature_request.md).

![Jev in Action expense categorization workspace with prompt controls, decision trace, and inspectable model input and output](docs/jev-in-action.gif)

_The playground before a run; bring your own key to see live decisions._

## What you can try

| Use case                   | Try it                                                           | What happens                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gesture web tools**      | Pinch or close a fist over the card, then move and release.      | Jev authorizes a grab; local hand tracking moves the card. Point to select, or close and open your fist twice to reset. Camera-free simulations are included. |
| **Categorize expenses**    | “Treat streaming and music subscriptions as Entertainment.”      | Edit up to 20 transactions; Jev categorizes them in one API request.                                                                                          |
| **Book a flight**          | “Choose the cheapest available flight, even if it has one stop.” | Code filters a sample Bengaluru–Delhi schedule; Jev selects a match from eligible flights.                                                                    |
| **Book an appointment**    | “Find a time after 3 PM.”                                        | Choose a date and service; Jev picks an available sample slot.                                                                                                |
| **Compare tool selection** | “Find checkout errors from the last hour.”                       | Compare all-tool LLM selection against Jev routing with progressive schema disclosure, across 10–250 mock tools.                                              |

The expense, flight, and appointment demos include **Try another prompt** and show an action trace, a result summary, and expandable Jev request/response JSON. Gesture controls show the observed hand pose, Jev confidence, and request/response JSON. Tool selection offers side-by-side metrics, a benchmark, exact context inspection, and JSON export.

**Real model decisions, sample application data.** Flight schedules, appointment availability, and enterprise tool outputs are fixtures. Booking confirmations are simulated; no flight or appointment is actually booked. Enterprise reads and writes are mocked; no external integration is called. The application never substitutes fake model responses when a key is missing or a provider fails.

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

Without a key, you can explore the interface and mock tool registry. Model calls require credentials and may incur provider charges. “Key configured” means a key is present; your first run verifies access.

### Compare tool selection and run the benchmark

Add an **OpenRouter API key** and a model that supports tool calling in API settings. Add a **Jev key** for the routed path. Open **Compare tool selection** (`/compare.html`), choose a registry size and prompt, then select **Run Standard**, **Run JEV Router**, or **Run Both**.

- **Standard:** the LLM receives every enabled tool schema and selects a tool with arguments. Code validates the arguments and runs a mock function.
- **Jev Router:** the LLM first receives only `route(intent)`. Jev receives the original prompt, proposed intent, and compact capability descriptions. Only the selected schema is then disclosed to the same LLM for argument generation. Both LLM calls count toward usage and latency.
- **Context sent to model** shows exact provider requests, responses, errors, and mock output. The internal registry never goes to the main LLM in Jev mode.
- **Run Benchmark** runs 10 labeled prompts at 10, 25, 50, 100, and 250 tools through both approaches: 100 mode runs and up to 200 provider calls. It alternates mode order, uses the same selected LLM, and shows partial results as it runs. **Stop after current run** stops scheduling more requests. API charges may apply.
- **Export session** saves all measured results and exact exchanges. Results live only in page memory on both local and hosted versions; export before reloading.

Token counts use provider `prompt_tokens` / `input_tokens`, `completion_tokens` / `output_tokens`, and `total_tokens`. When total is absent, it is the sum of reported input and output counts. Counts are never estimated. LLM totals sum every LLM call; missing metadata makes that aggregate unavailable. Cost uses provider `usage.cost` in USD when present; no prices or zero costs are assumed.

Jev usage, cost, native confidence, and routing latency remain separate. Missing Jev tokens display **JEV token usage not exposed**; missing cost and confidence stay unavailable. LLM token reduction is shown only for successful runs with the same prompt, size, requested model, and reported model and complete total-token counts. Cost difference covers LLM calls only, excluding Jev overhead. Latency uses server wall-clock time including network, parsing, and mock execution.

The registry has 25 enterprise capabilities; larger sizes add explicit synthetic workspace variants. All ten expected tools exist at every size. Benchmark accuracy measures tool selection separately from argument validation/execution success. Failures remain in the accuracy denominator; averages show available measurement sample counts. This fixed synthetic evaluation does not establish general routing quality or assume Jev wins. There is no charting dependency, so results use a table.

The other four demos remain Jev-only. The experiment follows the existing server ES-module JavaScript structure and adds no dependencies.

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
| `OPENROUTER_MODEL`   | Tool-calling model for comparison | `openai/gpt-4.1-mini` |
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
UI shows the decision; you confirm any demo booking
```

Jev supplies a structured judgment; application code owns the constraints and execution.

- **Gestures:** on-device hand tracking supplies finger measurements and recent motion alongside canvas context. Jev chooses grab, select, reset, or unclear; dragging and release run locally.
- **Expenses:** one Choice question per transaction, evaluated together.
- **Flights:** code excludes sold-out flights and enforces budget, arrival, and stop limits. Jev selects among the remaining options using your prompt, with a no-match option.
- **Appointments:** code supplies available slots for the chosen date and service. Jev selects a suitable slot or returns no match. Times are IST.
- **Tool selection:** a configurable enterprise registry, separate routing paths, a validated mock executor, provider metrics, and a browser-driven benchmark runner. Implementation lives in `server/tool-selection/` and `public/tool-selection*.js`. The previous MCP APIs remain available for compatibility but are no longer the displayed use case.

## Keys, data, and hosting

- UI keys use **sessionStorage** by default. **Remember on this device** switches to **localStorage**, which persists after closing the browser. Both are browser storage, not encrypted credential vaults.
- Keys travel through the app server to the selected provider. They are not intentionally included in model payloads, saved results, or exports. Prompts and application state are sent to the provider.
- **Clear saved keys** removes browser keys; any `.env` keys still apply.
- The tool-selection experiment does not write to disk or a database. Its page keeps results in memory for JSON export. Legacy MCP APIs still use the local `.data/events.jsonl` journal when called directly.
- Camera frames and full hand landmarks stay on-device; derived gesture observations go to Jev. Camera use needs HTTPS or localhost and permission. Tracking accuracy depends on lighting and hand visibility; initial actions still wait for Jev.
- `.env`, `.data/`, dependencies, and generated test artifacts are ignored by Git. Never paste credentials into prompts, issues, or screenshots.

## Deploy on Vercel

Import this repository into Vercel with **Express** as the Framework Preset and the repository root as the Root Directory. Use `npm ci` for installation; use the repository’s `npm run build` Build Command and leave Output Directory at its default. The root `app.js` is the hosted entry point. `vercel.json` configures a 60-second function limit, security headers, and the Express preset. Node.js is pinned to 22.x.

**No provider environment variables are required.** Visitors enter their own keys in the UI. Hosted code ignores deployment-level API keys; optional `TYPESAFE_MODEL` and `OPENROUTER_MODEL` variables can set model defaults.

The tool-selection benchmark makes one server request per mode and case. Each mode has a shared 50-second provider deadline within the function's 60-second limit. Hosted visitors supply their own keys, and results remain local to the open page. No shared benchmark history or database is used. Keys pass through the function and are not written to storage.

`npm run dev` uses local server key fallbacks when configured. Legacy MCP endpoints and the local journal remain for compatibility; the new experiment does not use them.

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

Tests use synthetic provider responses, so no API keys or paid model calls are needed. Browser tests start their own temporary local test server, exercise mock tool selection and the other demos, and save screenshots to `test-artifacts/`. They do not verify live model quality. CI runs backend and browser checks on Node.js 22.

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
