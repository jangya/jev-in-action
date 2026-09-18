import { fileURLToPath } from 'node:url';
import { connectMcp } from './mcp-client.js';
import { createRouters } from './routers.js';
import { Store } from './store.js';
import { Experiment } from './experiment.js';
import { createApp } from './app.js';

const mcp = await connectMcp();
const store = await new Store(fileURLToPath(new URL('../.data/events.jsonl', import.meta.url))).init();
const experiment = new Experiment({ mcp, store, routers: createRouters() });
const port = Number(process.env.PORT || 3000);
const server = createApp(experiment).listen(port, '127.0.0.1', () => console.log(`Jev in Action → http://localhost:${port}\nFive read-only MCP tools connected. Results are saved in .data/events.jsonl.`));
server.on('error', async error => { console.error(error.message); await mcp.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(async () => { await mcp.close(); process.exit(0); });
});
