const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function usage(raw = {}) {
  const u = raw.usage;
  const inputTokens = number(u?.prompt_tokens ?? u?.input_tokens);
  const outputTokens = number(u?.completion_tokens ?? u?.output_tokens);
  return {
    inputTokens, outputTokens,
    totalTokens: number(u?.total_tokens) ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
    costUsd: number(u?.cost), raw: u ?? null,
    source: 'Provider usage metadata; no token estimates or assumed prices',
  };
}
export function sumUsage(calls) {
  return Object.fromEntries(['inputTokens', 'outputTokens', 'totalTokens', 'costUsd'].map(key => [key,
    calls.length && calls.every(call => call.metrics[key] !== null) ? calls.reduce((sum, call) => sum + call.metrics[key], 0) : null,
  ]));
}
