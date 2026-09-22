import { z } from 'zod';

export const registrySizes = [10, 25, 50, 100, 250];
// The first ten capabilities are present at every size and cover the evaluation set.
const specifications = [
  ['splunk', 'search_logs', 'Search application logs by query and time range', 'query,timeRange'],
  ['datadog', 'get_service_latency', 'Get latency percentiles for a service', 'service,timeRange'],
  ['jira', 'search_issues', 'Search Jira issues by text or JQL', 'query'],
  ['jira', 'create_issue', 'Create a Jira issue in a project', 'project,title,description', 'write'],
  ['github', 'search_code', 'Search source code in GitHub repositories', 'query'],
  ['customer', 'get_customer_profile', 'Get a customer profile by customer ID', 'customerId'],
  ['account', 'get_account_balance', 'Get the current balance of an account', 'accountId'],
  ['datadog', 'get_incidents', 'List monitoring incidents for a service', 'service'],
  ['github', 'get_pull_request', 'Get a GitHub pull request by repository and number', 'repository,pullRequestNumber'],
  ['customer', 'get_transactions', 'List customer transactions within a time range', 'customerId,timeRange'],
  ['splunk', 'get_error_details', 'Get details for a specific log error ID', 'errorId'],
  ['splunk', 'get_log_volume', 'Get log volume counts for a service', 'service,timeRange'],
  ['datadog', 'get_metrics', 'Query a monitoring metric time series', 'query,timeRange'],
  ['jira', 'get_issue', 'Get a Jira issue by its issue key', 'issueKey'],
  ['jira', 'update_issue', 'Update an existing Jira issue description', 'issueKey,description', 'write'],
  ['github', 'search_repositories', 'Search GitHub repository metadata', 'query'],
  ['github', 'create_issue', 'Create a GitHub issue in a repository', 'repository,title,description', 'write'],
  ['customer', 'search_customer', 'Find customers by name or email', 'query'],
  ['account', 'get_invoices', 'List invoices for an account', 'accountId'],
  ['account', 'get_subscription', 'Get subscription plan and renewal date', 'accountId'],
  ['pagerduty', 'get_on_call', 'Find the current on-call responder for a service', 'service'],
  ['salesforce', 'search_opportunities', 'Search CRM sales opportunities', 'query'],
  ['zendesk', 'search_tickets', 'Search customer support tickets', 'query'],
  ['inventory', 'get_stock', 'Get warehouse inventory for a SKU', 'sku'],
  ['deployment', 'get_releases', 'List deployment releases for a service', 'service'],
];

export function createRegistry(size) {
  if (!registrySizes.includes(size)) throw new Error('Unsupported registry size.');
  return Array.from({ length: size }, (_, index) => {
    const [category, operation, description, fields, risk = 'read'] = specifications[index % 25];
    const workspace = Math.floor(index / 25);
    const id = `${category}_${operation}${workspace ? `_workspace_${workspace}` : ''}`;
    const scope = workspace ? `workspace-${workspace}` : 'default';
    const properties = Object.fromEntries(fields.split(',').map(field => [field, { type: 'string', minLength: 1, maxLength: 2000, description: field.replace(/([A-Z])/g, ' $1').toLowerCase() }]));
    const validator = z.object(Object.fromEntries(Object.keys(properties).map(field => [field, z.string().trim().min(1).max(2000)]))).strict();
    return {
      id, name: id, category, risk,
      description: `${description}. Scope: ${scope}; use only for ${workspace ? `explicit requests for ${scope}` : 'requests without an explicit workspace or requests for the default workspace'}.`,
      inputSchema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
      validator,
      execute: args => ({ source: 'Static enterprise fixture', mocked: true, tool: id, scope, operation: risk === 'write' ? 'simulated write; no external change' : 'sample read', arguments: args, data: { recordId: 'fixture-001', summary: `Sample ${category} ${operation} result` } }),
    };
  });
}
export const definition = tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } });
export const metadata = tool => ({ id: tool.id, name: tool.name, description: tool.description, inputSchema: tool.inputSchema, category: tool.category, risk: tool.risk });
export const cases = [
  ['Find checkout errors from the last hour', 'splunk_search_logs'],
  ['Check latency for the payment service in the last hour', 'datadog_get_service_latency'],
  ['Find Jira issues related to authentication', 'jira_search_issues'],
  ['Create a Jira issue in CHECKOUT titled Checkout failure with description Payment fails at checkout', 'jira_create_issue'],
  ['Find GitHub code containing validatePayment', 'github_search_code'],
  ['Get the customer profile for C-100', 'customer_get_customer_profile'],
  ['Get the balance of account A-100', 'account_get_account_balance'],
  ['List Datadog incidents for checkout', 'datadog_get_incidents'],
  ['Get pull request 42 from GitHub repository acme/shop', 'github_get_pull_request'],
  ['Get transactions for customer C-100 from the last month', 'customer_get_transactions'],
].map(([prompt, expectedTool], i) => ({ id: `enterprise-${i + 1}`, prompt, expectedTool }));
