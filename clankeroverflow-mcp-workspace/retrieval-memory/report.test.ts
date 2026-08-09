import { describe, expect, test } from "vitest";

import { CASE_CATEGORIES, type BenchmarkRun, type RetrievalMetrics } from "./types.js";
import { formatReport } from "./report.js";

const zeroMetric = (): RetrievalMetrics => ({
  positiveCases: 0,
  ndcg10: { value: 0, low: 0, high: 0 },
  mrr10: { value: 0, low: 0, high: 0 },
  recall1: { value: 0, low: 0, high: 0 },
  recall3: { value: 0, low: 0, high: 0 },
  recall10: { value: 0, low: 0, high: 0 },
  safeReusePrecisionAt1: { value: 0, low: 0, high: 0 },
  abstentionPrecision: { value: 0, low: 0, high: 0 },
  abstentionRecall: { value: 0, low: 0, high: 0 },
  abstentionF1: { value: 0, low: 0, high: 0 },
  noUsefulMemoryAccuracy: { value: 0, low: 0, high: 0 },
  unsafeReturnRate: { value: 0, low: 0, high: 0 },
  staleFixRate: { value: 0, low: 0, high: 0 },
  wrongVersionRate: { value: 0, low: 0, high: 0 },
  wrongRootCauseRate: { value: 0, low: 0, high: 0 },
  constraintViolationRate: { value: 0, low: 0, high: 0 },
});

function fixtureRun(): BenchmarkRun {
  const metrics = zeroMetric();
  return {
    benchmark: "ClankerOverflow Memory Retrieval Benchmark",
    version: 1,
    split: "test",
    dataset: {
      families: 30,
      solutions: 150,
      cases: 210,
      developmentCases: 70,
      testCases: 140,
      casesPerCategory: Object.fromEntries(
        CASE_CATEGORIES.map((category) => [category, 30]),
      ) as BenchmarkRun["dataset"]["casesPerCategory"],
      repeatabilityFingerprint: "a".repeat(64),
    },
    thresholds: [
      {
        method: "structured",
        threshold: 0.8,
        developmentF1: 1,
        developmentNoUsefulAccuracy: 1,
        tunedOnSplit: "development",
      },
    ],
    methods: [
      {
        method: "structured",
        split: "test",
        candidatePoolSize: 150,
        latency: { coldStartMs: 1, warmMedianMs: 2, warmP95Ms: 3 },
        model: {
          embedding: "deterministic-hash-v1",
          reranker: "fixture-v1",
          rerankerRevision: "fixture-v1",
          cacheDir: ".cache",
          offline: true,
        },
        calibration: {
          method: "structured",
          threshold: 0.8,
          developmentF1: 1,
          developmentNoUsefulAccuracy: 1,
          tunedOnSplit: "development",
        },
        metrics,
        categoryMetrics: Object.fromEntries(
          CASE_CATEGORIES.map((category) => [category, metrics]),
        ) as BenchmarkRun["methods"][number]["categoryMetrics"],
        queries: [],
      },
    ],
    warnings: ["fixture warning"],
    artifacts: {},
  };
}

describe("memory retrieval report", () => {
  test("is deterministic and includes the structured comparison sections", () => {
    const first = formatReport(fixtureRun());
    expect(first).toBe(formatReport(fixtureRun()));
    expect(first).toContain("## Category slices");
    expect(first).toContain("matching fingerprints receive a deterministic boost");
    expect(first).toContain("fixture warning");
  });
});
