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

// The SDK still performs JSON-RPC discovery and calls, without a subprocess.
export async function connectHostedMcp() {
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { createMcpServer } = await import('./mcp-fixtures.js');
  const server = createMcpServer();
  const client = new Client({ name: 'jev-in-action-hosted', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  return { tools, callTool: args => client.callTool(args), close: async () => { await client.close(); await server.close(); } };
}
