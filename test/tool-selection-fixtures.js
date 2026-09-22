// Synthetic provider data shared by the existing browser checks; never used by the app.
import { cases, createRegistry } from '../server/tool-selection/registry.js';
export function selectionFixture(body) {
  const isJev = Boolean(body.questions?.route?.criteria?.splunk_search_logs);
  const isLlm = body.tools?.some(tool => ['route', 'splunk_search_logs'].includes(tool.function.name)) || body.messages?.some(message => message.role === 'tool');
  if (!isJev && !isLlm) return null;
  const prompt = isJev ? body.state.userRequest : body.messages[1].content;
  const expected = cases.find(item => item.prompt === prompt)?.expectedTool || 'splunk_search_logs';
  if (isJev) return Response.json({ model: 'fixture-jev', answers: { route: { type: 'choice', choice: expected, confidence: 0.81 } } });
  const routing = body.tools[0].function.name === 'route';
  const tool = createRegistry(25).find(tool => tool.id === expected);
  return Response.json({ model: 'fixture-llm', choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'fixture-call', type: 'function', function: { name: routing ? 'route' : expected, arguments: JSON.stringify(routing ? { intent: prompt } : Object.fromEntries(tool.inputSchema.required.map(key => [key, 'fixture-value']))) } }] } }], usage: { prompt_tokens: routing ? 60 : body.tools.length * 100, completion_tokens: 20, total_tokens: (routing ? 60 : body.tools.length * 100) + 20, cost: 0.001 } });
}
