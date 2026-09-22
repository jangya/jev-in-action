import { definition } from './registry.js';
import { parseLlm, readMetrics } from '../routers.js';
import { usage, sumUsage } from './metrics.js';
import { executeMock } from './executor.js';

const routeTool = { type: 'function', function: { name: 'route', description: 'Find an internal enterprise capability for the user intent. Preserve all requested details; no workspace means default.', parameters: { type: 'object', properties: { intent: { type: 'string' } }, required: ['intent'], additionalProperties: false } } };
const system = 'Select one tool to fulfill the user request. Supply its arguments without inventing identifiers. Use natural language time ranges. If no tool fits or required details are missing, respond exactly no_tool. Emit at most one tool call per response. The route capability discovers a tool; after receiving its result, call the disclosed tool with arguments.';
const payload = (prompt, model, tools) => ({ model, temperature: 0, max_tokens: 1024, parallel_tool_calls: false, tool_choice: 'auto', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], tools });

async function llmCall(routers, body, keys, result, signal, onProgress) {
  const call = { providerPayload: body, rawResponse: null, metrics: usage(), latencyMs: null };
  result.llmCalls.push(call);
  onProgress({ stage: result.mode === 'standard' ? 'OpenRouter: selecting from all tools' : result.llmCalls.length === 1 ? 'OpenRouter: preparing route intent' : 'OpenRouter: generating selected tool arguments' });
  const start = performance.now();
  try {
    call.rawResponse = await routers.complete(body, keys.llm, signal);
    call.metrics = usage(call.rawResponse);
    return parseLlm(call.rawResponse);
  } finally { call.latencyMs = Math.round(performance.now() - start); }
}
export async function standardRoute({ prompt, registry, model, routers, keys, result, signal, onProgress }) {
  return llmCall(routers, payload(prompt, model, registry.map(definition)), keys, result, signal, onProgress);
}
export async function jevRoute({ prompt, registry, model, routers, keys, result, signal, onProgress }) {
  const initial = payload(prompt, model, [routeTool]);
  const routed = await llmCall(routers, initial, keys, result, signal, onProgress);
  if (routed.tool === 'no_tool') return routed;
  if (routed.tool !== 'route' || typeof routed.arguments?.intent !== 'string' || !routed.arguments.intent.trim() || routed.arguments.intent.length > 4000 || Object.keys(routed.arguments).length !== 1) throw new Error('LLM did not emit a valid route(intent) call.');
  if (!result.llmCalls[0].rawResponse.choices[0].message.tool_calls[0].id) throw new Error('Routing tool call is missing its call ID.');
  const state = { userRequest: prompt, intent: routed.arguments.intent };
  const questions = { route: { type: 'choice', instructions: 'Select the one capability that best fulfills userRequest. Intent is an LLM paraphrase; userRequest is authoritative. Respect product and workspace. No explicit workspace means default. Choose no_tool if unsupported.', criteria: { ...Object.fromEntries(registry.map(tool => [tool.id, `${tool.description} Risk: ${tool.risk}.`])), no_tool: 'No available capability satisfies this request.' } } };
  // Keep the complete compact catalog inside the Jev request, never the LLM messages.
  result.jev = { providerPayload: { model: routers.status.jev.model, state, questions }, rawResponse: null, latencyMs: null, metrics: usage(), confidence: null, selectedProbability: null };
  const start = performance.now();
  let decision;
  onProgress({ stage: 'Jev: selecting an internal capability' });
  try {
    const response = await routers.decide(state, questions, keys.jev, signal);
    result.jev.rawResponse = response.rawResponse;
    result.jev.metrics = usage(response.rawResponse);
    const metrics = readMetrics(response.rawResponse, 'jev');
    Object.assign(result.jev, { confidence: metrics.confidence, selectedProbability: metrics.selectedProbability });
    decision = response.answers.route.choice;
    result.tool = decision;
  } catch (error) {
    if (error.rawResponse) {
      result.jev.rawResponse = error.rawResponse;
      result.jev.metrics = usage(error.rawResponse);
    }
    throw error;
  } finally { result.jev.latencyMs = Math.round(performance.now() - start); }
  if (decision === 'no_tool') return { tool: 'no_tool', arguments: {} };
  const selected = registry.find(tool => tool.id === decision);
  if (!selected) throw new Error('Jev selected a tool outside the registry.');
  const disclosed = payload(prompt, model, [definition(selected)]);
  disclosed.messages.push(
    result.llmCalls[0].rawResponse.choices[0].message,
    { role: 'tool', tool_call_id: result.llmCalls[0].rawResponse.choices[0].message.tool_calls[0].id, content: JSON.stringify({ selectedTool: selected.id, schema: selected.inputSchema }) },
  );
  const generated = await llmCall(routers, disclosed, keys, result, signal, onProgress);
  if (generated.tool === 'no_tool') throw new Error('Jev selected a capability, but the LLM declined to generate its arguments.');
  if (generated.tool !== decision) throw new Error('LLM called a tool other than the disclosed selection.');
  return generated;
}
export async function runSelection({ mode, prompt, size, model, registry, expectedTool = null }, routers, keys, { onProgress = () => {}, signal: cancellation } = {}) {
  const result = { mode, prompt, size, requestedModel: model, expectedTool, tool: null, arguments: null, status: 'error', error: null, llmCalls: [], jev: null, output: null };
  const start = performance.now();
  // Leave room for the hosted 60-second function limit across all three provider calls.
  const deadline = AbortSignal.timeout(50000);
  const signal = cancellation ? AbortSignal.any([deadline, cancellation]) : deadline;
  let stage = 'Starting';
  const progress = update => { stage = update.stage; onProgress(update); };
  try {
    if (!keys.llm && !routers.status.llm.configured) throw new Error('Add an OpenRouter key in API key settings.');
    if (mode === 'jev' && !keys.jev && !routers.status.jev.configured) throw new Error('Add a Jev key in API key settings.');
    const decision = await (mode === 'standard' ? standardRoute : jevRoute)({ prompt, registry, model, routers, keys, result, signal, onProgress: progress });
    result.tool = decision.tool;
    result.arguments = decision.arguments;
    if (decision.tool !== 'no_tool') result.output = executeMock(registry, decision.tool, decision.arguments);
    result.status = 'ok';
  } catch (error) { result.error = deadline.aborted ? `Run timed out after 50 seconds while waiting for ${stage}. No retry was made. Try again or choose another model.` : signal.aborted ? 'Run cancelled because the client disconnected.' : error.message; }
  result.latencyMs = Math.round(performance.now() - start);
  result.llm = sumUsage(result.llmCalls);
  result.correctTool = expectedTool === null ? null : result.tool === expectedTool;
  return result;
}
