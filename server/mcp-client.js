import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { definitions } from './catalog.js';

export async function connectMcp() {
  const client = new Client({ name: 'route-lab', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./mcp-server.js', import.meta.url))],
    stderr: 'inherit',
  });
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (tools.length !== 5 || definitions.some(d => !tools.some(t => t.name === d.name && t.annotations?.readOnlyHint))) {
    await client.close();
    throw new Error('Expected exactly the five approved read-only MCP tools.');
  }
  return { tools, callTool: args => client.callTool(args), close: () => client.close() };
}
