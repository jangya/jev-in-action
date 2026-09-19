import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { argumentSchema, definitions } from './catalog.js';

export function createMcpServer() {
const server = new McpServer({ name: 'route-lab-fixtures', version: '0.1.0' });
const fixtures = {
  get_service_health: { status: 'operational', availabilityPercent: 99.97, errorRatePercent: 0.03, p95LatencyMs: 142 },
  list_incidents: { incidents: [{ id: 'INC-DEMO-001', status: 'resolved', title: 'Elevated latency', startedAt: '2026-09-15T09:00:00Z', resolvedAt: '2026-09-15T09:24:00Z' }] },
  list_deployments: { deployments: [{ version: 'v1.8.2', deployedAt: '2026-09-16T12:00:00Z', status: 'completed' }] },
  get_runbook: { steps: ['Check the service health dashboard.', 'Review recent deployments and recorded incidents.', 'Escalate to the service owner if the issue persists.'] },
  list_feature_flags: { flags: [{ name: 'new-experience', enabled: true, rolloutPercent: 25 }, { name: 'verbose-diagnostics', enabled: false, rolloutPercent: 0 }] },
};
for (const tool of definitions) {
  server.registerTool(tool.name, {
    title: tool.title, description: tool.description, inputSchema: argumentSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async args => ({ content: [{ type: 'text', text: JSON.stringify({
    source: 'Static demo fixture — not live infrastructure data',
    ...argumentSchema.parse(args), ...fixtures[tool.name],
  }) }] }));
}
return server;
}
