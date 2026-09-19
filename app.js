import express from 'express';
import { createApp } from './server/app.js';
import { connectHostedMcp } from './server/mcp-client.js';
import { createRouters } from './server/routers.js';

// Vercel discovers this root entry point. No disk writes or child process.
const app = express();
let handler;
async function initialize() {
  const mcp = await connectHostedMcp();
  // Hosted visitors must bring their own key; never use deployment credentials.
  const routers = createRouters({ TYPESAFE_MODEL: process.env.TYPESAFE_MODEL, OPENROUTER_MODEL: process.env.OPENROUTER_MODEL });
  return createApp({ mcp, routers, store: {} }, { hosted: true });
}
app.use(async (req, res, next) => {
  try {
    handler ||= initialize().catch(error => { handler = null; throw error; });
    (await handler)(req, res, next);
  } catch { res.status(503).json({ error: 'Could not initialize demo tools. Please retry.' }); }
});
export default app;
