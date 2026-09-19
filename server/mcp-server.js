import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp-fixtures.js';
await createMcpServer().connect(new StdioServerTransport());
