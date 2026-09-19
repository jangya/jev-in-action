# Architecture and evaluation notes

The journal and durable execution guarantees below describe **local mode**. Hosted mode uses session-local browser history, an in-process MCP transport, and public read-only fixture execution without a durable server execution ledger. See [Vercel deployment](../README.md#deploy-on-vercel) for that distinction.

## Design and Jev mapping

```text
                           same request + MCP tools/list + shared policy
                                             |
                         +-------------------+-------------------+
                         |                                       |
                 OpenRouter Chat Completions               TypeSafe systemone
                 function definitions                     Choice: tool
                 single function call                     Choice: service
                                                          Choice: environment
                         |                                       |
                         +-------------------+-------------------+
                                             |
                                  validate + store comparison
                                             |
                                    side-by-side browser UI
                                             |
                                explicitly choose ONE valid route
                                             |
                              durable claim -> MCP tools/call once
```

The backend discovers five tools from a real local MCP server over stdio using the official SDK. The tools read **static demo fixtures**, not live infrastructure. They cannot write files, run commands, contact infrastructure, or change configuration.

| Tool                 | Read-only purpose                         |
| -------------------- | ----------------------------------------- |
| `get_service_health` | Current availability, latency, error rate |
| `list_incidents`     | Recorded incidents and outage timelines   |
| `list_deployments`   | Release and rollout history               |
| `get_runbook`        | Operational instructions                  |
| `list_feature_flags` | Flag states and rollout percentages       |

Every tool accepts `service: auth | billing | search` and `environment: production | staging`. Both routers use production if omitted. A missing/unknown service, unsupported environment, change request, or request requiring several tools should yield `no_tool`.

Jev gets one `Choice` for the tool and two independent `Choice` questions for these shared enum arguments. Options come from the discovered MCP schemas; tool-option descriptions are verbatim MCP descriptions. `no_tool` and argument `unspecified` are non-executable outcomes, not extra MCP tools. The selected branch consumes its answers. The backend validates all arguments and tool names before execution. This first version intentionally does not extract arbitrary strings, IDs, or dates.

OpenRouter receives the same canonical JSON state as its user message, plus native function definitions made from the same catalog. Jev receives that state directly. The API wrappers necessarily differ; this is equivalent-information comparison, not identical tokenization or compute. No expected labels or tool outputs are provided to either router. Inputs and provider payloads are inspectable in the UI and export.

## Data model

- **Tool**: discovered MCP name, description, input schema, annotations.
- **Comparison**: UUID, timestamp, exact shared state, input/catalog SHA-256 hashes, optional expected tool/arguments, dataset version, batch/case IDs, both routing results, agreement, correctness.
- **Routing result**: provider, requested/returned model, status, tool, arguments, server-measured routing latency, returned token usage, Jev route confidence/probabilities, cost availability, request ID, provider request payload and raw successful response, error.
- **Execution**: comparison ID, chosen router, validated call, durable claim timestamp, final status, MCP output or error.
- **Dataset case**: ID, request, expected tool, expected enum arguments. See `server/dataset.js`.

Records are appended and flushed to `.data/events.jsonl`. The browser can export all inputs, outputs, labels, summaries, and executions as JSON. This contains request text; keep it local if requests are sensitive. Keys come from server environment variables or request-scoped browser headers and are never included in records.

## Measurements and interpretation

- Routers run concurrently for each input. Benchmark cases run sequentially, with 20 requests per provider and no automatic retries.
- Routing latency uses `performance.now()` around the HTTP attempt and parsing/validation. It includes network and provider time; it excludes MCP execution and queue time. Failed attempts retain their elapsed time, and missing keys have **null**, not zero, latency.
- Token usage is copied only from provider usage fields. If missing, it remains unavailable.
- Jev confidence and selected-option probability are copied separately from its answer. Confidence describes the distribution; it is not proof that the tool or arguments are correct. Raw argument answers remain visible.
- OpenRouter tool calls do not provide calibrated route confidence. It remains null.
- Neither documented response contract provides billed per-request USD cost. Cost stays **unavailable**, not zero. No stale token prices or invented estimates are used. Exported token usage supports separate cost analysis with your applicable billing rates.
- Accuracy is correct tool selections / attempted labeled cases, counting provider errors, invalid decisions, and abstentions on positive examples as misses. Tool+argument accuracy requires both the correct tool and exact arguments.
- Agreement uses only pairs of valid decisions. Two incorrect decisions can agree. Mean/p95 latency uses successful decisions only, with counts and errors exported. Do not compare these aggregates without looking at failure rates.
- The 20-case dataset is a balanced smoke test, with four positive cases per tool. It is not statistically strong evidence, has no labeled abstention cases, and is not a general arbitrary-schema MCP benchmark. Add held-out paraphrases, ambiguous requests, negative cases, randomized order, repetitions, and pinned models for stronger conclusions. Custom requests can be labeled `no_tool` in the UI.

## Execution guarantee and scope

Comparison never calls `tools/call`. Benchmark records are permanently non-executable. A live comparison can dispatch at most one route after an explicit click. The executor takes an in-process lock, writes and flushes a claim, and only then calls MCP. Double clicks, choosing the other router, refreshes, and restarts cannot dispatch it again. Failed or indeterminate attempts are not retried. After a crash a `claimed` record may mean the tool ran or did not run; create a new comparison only if you intentionally want a new call.

This is a local single-process application. Run one server against one journal; distributed execution, authentication, retention, and remote MCP configuration are outside this prototype. The server binds loopback, rejects foreign hosts and cross-origin JSON writes, and serves a restrictive content security policy.

## Verify

```sh
npm test
npm run test:browser
```

Backend tests use the real MCP server and isolated synthetic provider responses to verify input parity, metrics, validation, benchmark scoring, and execution races/restart behavior. Browser tests launch a separate temporary app with test-only providers, exercise real UI actions and real MCP calls, and capture screenshots. They do not measure live model quality. Browser testing uses installed Google Chrome on macOS, or Playwright Chromium elsewhere (`npx playwright install chromium`).

## Sources

- [TypeSafe skill](../.agents/skills/typesafe-ai/SKILL.md)
- [TypeSafe API](https://docs.typesafe.ai/api)
- [Choice](https://docs.typesafe.ai/primitives/choice)
- [Function-calling cookbook](https://docs.typesafe.ai/cookbooks/function_calling)
- [Confidence](https://docs.typesafe.ai/confidence)
- [OpenRouter API](https://openrouter.ai/docs/api-reference/overview)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x)
