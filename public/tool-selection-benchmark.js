export async function runBenchmark({ sizes, cases, run, onResult, stopped }) {
  const results = [];
  for (const size of sizes) {
    for (const [index, item] of cases.entries()) {
      // Alternate order to reduce systematic first-call/cache advantage.
      for (const mode of index % 2 ? ['jev', 'standard'] : ['standard', 'jev']) {
        if (stopped()) return results;
        const result = await run({ mode, size, prompt: item.prompt, caseId: item.id });
        results.push(result);
        onResult(results, result);
      }
    }
  }
  return results;
}
export function summarizeBenchmark(results, sizes) {
  return sizes.flatMap(size => ['standard', 'jev'].map(mode => {
    const rows = results.filter(row => row.size === size && row.mode === mode);
    const mean = values => ({ value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, samples: values.length });
    const metric = key => mean(rows.map(row => row.llm[key]).filter(value => value !== null));
    return { size, mode, count: rows.length, successes: rows.filter(row => row.status === 'ok').length,
      accuracy: rows.length ? rows.filter(row => row.correctTool).length / rows.length : null,
      input: metric('inputTokens'), total: metric('totalTokens'), cost: metric('costUsd'),
      latency: mean(rows.map(row => row.latencyMs)),
      jevCost: mean(rows.map(row => row.jev?.metrics.costUsd).filter(value => value != null)),
      jevTokens: mean(rows.map(row => row.jev?.metrics.totalTokens).filter(value => value != null)),
    };
  }));
}
