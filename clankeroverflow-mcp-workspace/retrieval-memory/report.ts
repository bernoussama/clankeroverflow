import type { BenchmarkRun, MetricWithInterval, MethodRun, RetrievalMethod } from "./types.js";

type IntervalMetric = Exclude<keyof MethodRun["metrics"], "positiveCases">;

function percent(metric: MetricWithInterval) {
  return `${(metric.value * 100).toFixed(1)}% (${(metric.low * 100).toFixed(1)}-${(metric.high * 100).toFixed(1)}%)`;
}

function metricTable(run: BenchmarkRun, metric: IntervalMetric) {
  return run.methods
    .map((method) => `| ${method.split} | ${method.method} | ${percent(method.metrics[metric])} |`)
    .join("\n");
}

function categoryTable(methods: readonly MethodRun[]) {
  return methods
    .flatMap((method) =>
      Object.entries(method.categoryMetrics).map(
        ([category, metrics]) =>
          `| ${method.split} | ${method.method} | ${category} | ${percent(metrics.ndcg10)} | ${percent(metrics.abstentionF1)} | ${percent(metrics.constraintViolationRate)} |`,
      ),
    )
    .join("\n");
}

function methodsSummary(methods: readonly MethodRun[]) {
  return methods
    .map(
      (method) =>
        `| ${method.split} | ${method.method} | ${percent(method.metrics.ndcg10)} | ${percent(method.metrics.safeReusePrecisionAt1)} | ${percent(method.metrics.abstentionF1)} | ${percent(method.metrics.unsafeReturnRate)} | ${method.latency.warmMedianMs.toFixed(2)} | ${method.latency.warmP95Ms.toFixed(2)} |`,
    )
    .join("\n");
}

export function formatReport(run: BenchmarkRun) {
  const methods = run.methods
    .map((method) => method.method)
    .filter((method, index, all) => all.indexOf(method) === index);
  const methodList = methods.join(", ");
  return [
    "# ClankerOverflow Memory Retrieval Benchmark",
    "",
    "This public-style report compares retrieval quality, safe reuse, abstention, and efficiency on a frozen, sanitized memory benchmark. It is evidence for design discussion; it does not automatically promote a production retrieval strategy.",
    "",
    `- Dataset: ${run.dataset.families} families, ${run.dataset.solutions} solution fixtures, ${run.dataset.cases} cases (${run.dataset.developmentCases} development / ${run.dataset.testCases} held-out test).`,
    `- Split reported: ${run.split}; methods: ${methodList}.`,
    `- Repeatability fingerprint: \`${run.dataset.repeatabilityFingerprint}\`.`,
    `- Research synthesis: [research matrix](../research-matrix.md).`,
    "",
    "## Dataset and calibration",
    "",
    "Thresholds are selected only from the development split and then frozen before any held-out test result is computed.",
    "",
    "| Method | Tuned threshold | Development abstention F1 | Development no-useful accuracy |",
    "| --- | ---: | ---: | ---: |",
    run.thresholds
      .map(
        (threshold) =>
          `| ${threshold.method} | ${threshold.threshold.toFixed(2)} | ${(threshold.developmentF1 * 100).toFixed(1)}% | ${(threshold.developmentNoUsefulAccuracy * 100).toFixed(1)}% |`,
      )
      .join("\n"),
    "",
    "## Headline comparison",
    "",
    "| Split | Method | nDCG@10 | Safe-reuse precision@1 | Abstention F1 | Unsafe return rate | Warm median ms | Warm p95 ms |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    methodsSummary(run.methods),
    "",
    "Quality metrics use positive cases only. Safety and abstention metrics use the labeled negative cases as described in the dataset schema.",
    "",
    "## Retrieval quality",
    "",
    "| Split | Method | nDCG@10 |",
    "| --- | --- | ---: |",
    metricTable(run, "ndcg10"),
    "",
    "| Split | Method | MRR@10 | Recall@1 | Recall@3 | Recall@10 |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    run.methods
      .map(
        (method) =>
          `| ${method.split} | ${method.method} | ${percent(method.metrics.mrr10)} | ${percent(method.metrics.recall1)} | ${percent(method.metrics.recall3)} | ${percent(method.metrics.recall10)} |`,
      )
      .join("\n"),
    "",
    "## Safety and abstention",
    "",
    "| Split | Method | Safe precision@1 | Abstention precision | Abstention recall | Abstention F1 | No-useful accuracy | Stale-fix rate | Wrong-version rate | Wrong-root-cause rate | Constraint violations |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    run.methods
      .map(
        (method) =>
          `| ${method.split} | ${method.method} | ${percent(method.metrics.safeReusePrecisionAt1)} | ${percent(method.metrics.abstentionPrecision)} | ${percent(method.metrics.abstentionRecall)} | ${percent(method.metrics.abstentionF1)} | ${percent(method.metrics.noUsefulMemoryAccuracy)} | ${percent(method.metrics.staleFixRate)} | ${percent(method.metrics.wrongVersionRate)} | ${percent(method.metrics.wrongRootCauseRate)} | ${percent(method.metrics.constraintViolationRate)} |`,
      )
      .join("\n"),
    "",
    "## Category slices",
    "",
    run.methods.length
      ? [
          "Category slices for every reported method; raw JSON includes per-query rankings and bounded selection/rejection traces.",
          "",
          "| Split | Method | Category | nDCG@10 | Abstention F1 | Constraint violations |",
          "| --- | --- | --- | ---: | ---: | ---: |",
          categoryTable(run.methods),
        ].join("\n")
      : "No method results were produced.",
    "",
    "## Efficiency and reproducibility",
    "",
    run.methods
      .map(
        (method) =>
          `- **${method.split}/${method.method}**: cold start ${method.latency.coldStartMs.toFixed(2)} ms; warm median ${method.latency.warmMedianMs.toFixed(2)} ms; warm p95 ${method.latency.warmP95Ms.toFixed(2)} ms; implementation: ${method.implementation}.`,
      )
      .join("\n"),
    "",
    "## Interpretation guardrails",
    "",
    "- The keyword baseline does not enforce the fixture constraints. The reported constraint-violation, stale-fix, wrong-version, wrong-root-cause, unsafe-return, and abstention metrics quantify that risk.",
    "- This v2 suite intentionally covers keyword retrieval only and keeps those safety labels as regression evidence.",
    "- The benchmark keeps provenance for stale and rejected memories; it does not delete them or change production storage/retrieval.",
    "",
    "## Warnings",
    "",
    ...(run.warnings.length ? run.warnings.map((warning) => `- ${warning}`) : ["- None."]),
    "",
  ].join("\n");
}

export function summarizeMethods(methods: readonly MethodRun[]): RetrievalMethod[] {
  return methods
    .map((method) => method.method)
    .filter((method, index, all) => all.indexOf(method) === index);
}
