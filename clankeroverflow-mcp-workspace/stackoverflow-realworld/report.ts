import type { MetricSummary, MethodName } from "./types.js";

type MethodResult = {
  metrics: { development: MetricSummary; test: MetricSummary };
  latency: { p50Ms: number; p95Ms: number };
};

type ReportInput = {
  generatedAt: string;
  corpus: {
    solutions: number;
    queries: number;
    developmentQueries: number;
    testQueries: number;
    redistributionReady: boolean;
    relationshipsMissingProvenance: number;
  };
  indexMs: number;
  methods: Record<MethodName, MethodResult>;
  testSlices: Record<string, Record<MethodName, MetricSummary>>;
  rankingFingerprint: string;
};

const METHODS = ["exact", "tiered"] as const;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const interval = (metric: { value: number; low: number; high: number }) =>
  `${percent(metric.value)} (${percent(metric.low)}-${percent(metric.high)})`;

export function formatReport(input: ReportInput) {
  const rows = METHODS.map((method) => {
    const result = input.methods[method];
    const metrics = result.metrics.test;
    return `| ${method} | ${interval(metrics.recall1)} | ${interval(metrics.recall5)} | ${interval(metrics.recall10)} | ${metrics.mrr10.value.toFixed(3)} | ${metrics.ndcg10.value.toFixed(3)} | ${result.latency.p50Ms.toFixed(1)} | ${result.latency.p95Ms.toFixed(1)} |`;
  }).join("\n");
  const sliceRows = Object.entries(input.testSlices)
    .flatMap(([slice, methods]) =>
      METHODS.map(
        (method) =>
          `| ${slice} | ${method} | ${percent(methods[method].hit1.value)} | ${percent(methods[method].hit10.value)} | ${methods[method].mrr10.value.toFixed(3)} |`,
      ),
    )
    .join("\n");
  const exact = input.methods.exact.metrics.test;
  const tiered = input.methods.tiered.metrics.test;
  const redistributionBoundary = input.corpus.redistributionReady
    ? "The manifest confirms complete per-row license and author provenance for this prepared extract. Preserve the generated attribution fields in any redistribution."
    : `Do not redistribute the generated corpus: ${input.corpus.relationshipsMissingProvenance.toLocaleString()} source relationship(s) lack complete license and author provenance.`;

  return `# Stack Overflow keyword retrieval benchmark

Generated: ${input.generatedAt}

This benchmark stores each canonical Stack Overflow question plus its accepted answer as a ClankerOverflow solution, then searches with independently authored duplicate questions.

## Corpus and run

- ${input.corpus.solutions.toLocaleString()} solutions and ${input.corpus.queries.toLocaleString()} queries
- frozen split: ${input.corpus.developmentQueries} development / ${input.corpus.testQueries} test
- production local retrieval path: SQLite FTS5 keyword search
- index insertion: ${(input.indexMs / 1_000).toFixed(1)} s
- ranking fingerprint: \`${input.rankingFingerprint}\`

## Held-out test results

| Method | Recall@1 (95% CI) | Recall@5 (95% CI) | Recall@10 (95% CI) | MRR@10 | nDCG@10 | p50 ms | p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Decision readout

- Exact keyword retrieval is the first, low-noise probe used by auto mode.
- Tiered keyword retrieval is the automatic second attempt after an empty exact result.
- Held-out Hit@10 changes from ${percent(exact.hit10.value)} exact to ${percent(tiered.hit10.value)} tiered; MRR@10 changes from ${exact.mrr10.value.toFixed(3)} to ${tiered.mrr10.value.toFixed(3)}.

## Test slices

| Slice | Method | Hit@1 | Hit@10 | MRR@10 |
| --- | --- | ---: | ---: | ---: |
${sliceRows}

## Interpretation boundaries

- This positive-only benchmark does not test abstention, unsafe reuse, stale fixes, or version compatibility; the keyword memory-safety suite remains a separate gate.
- Accepted answers and duplicate links are relevance judgments, not proof that an answer is currently correct.
- ${redistributionBoundary}
`;
}
