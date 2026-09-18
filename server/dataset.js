const groups = [
  ['get_service_health', [
    ['Is the auth service healthy right now?', 'auth', 'production'],
    ['Show the current error rate for billing in staging.', 'billing', 'staging'],
    ['What is the current p95 latency of search in production?', 'search', 'production'],
    ['Is login available in staging at the moment?', 'auth', 'staging'],
  ]],
  ['list_incidents', [
    ['Show recorded outages for auth in production.', 'auth', 'production'],
    ['List resolved incidents for billing in staging.', 'billing', 'staging'],
    ['What incidents have been recorded for search?', 'search', 'production'],
    ['Find the outage timeline for login in staging.', 'auth', 'staging'],
  ]],
  ['list_deployments', [
    ['Which versions of auth were deployed to production?', 'auth', 'production'],
    ['Show the billing release history in staging.', 'billing', 'staging'],
    ['When was search last deployed?', 'search', 'production'],
    ['List recent rollouts of the login service in staging.', 'auth', 'staging'],
  ]],
  ['get_runbook', [
    ['Get the troubleshooting instructions for auth in production.', 'auth', 'production'],
    ['Where is the runbook for billing in staging?', 'billing', 'staging'],
    ['Show the operational procedures for search.', 'search', 'production'],
    ['How should I investigate login failures in staging? Show the instructions.', 'auth', 'staging'],
  ]],
  ['list_feature_flags', [
    ['Which feature flags are enabled for auth in production?', 'auth', 'production'],
    ['Show billing feature rollout percentages in staging.', 'billing', 'staging'],
    ['List the feature toggles configured for search.', 'search', 'production'],
    ['Read the login feature flag states in staging.', 'auth', 'staging'],
  ]],
];
export const DATASET_VERSION = 'read-only-routing-v1';
export const dataset = groups.flatMap(([expectedTool, rows], group) => rows.map(([request, service, environment], i) => ({
  id: `case-${String(group * 4 + i + 1).padStart(2, '0')}`,
  request, expectedTool, expectedArguments: { service, environment },
})));
