import { describe, expect, test } from "vitest";

import { benchmarkDataset } from "./fixtures.js";
import {
  bootstrapInterval,
  calibrateAbstention,
  queryRetrievalMetrics,
  repeatabilityFingerprint,
  summarizeMetrics,
} from "./metrics.js";
import type { MethodQueryResult } from "./types.js";

describe("memory retrieval metrics", () => {
  test("computes graded retrieval metrics over positive cases and ignores negative relevance", () => {
    const direct = benchmarkDataset.cases.find(
      (retrievalCase) => retrievalCase.category === "direct-reuse",
    )!;
    const target = direct.relevantSolutionIds[0]!;
    expect(queryRetrievalMetrics(direct, ["wrong", target])).toMatchObject({
      mrr10: 0.5,
      recall1: 0,
      recall3: 1,
    });
    const none = benchmarkDataset.cases.find(
      (retrievalCase) => retrievalCase.category === "no-useful-memory",
    )!;
    expect(queryRetrievalMetrics(none, ["wrong"])).toEqual({
      ndcg10: 0,
      mrr10: 0,
      recall1: 0,
      recall3: 0,
      recall10: 0,
    });
  });

  test("uses deterministic bootstrap intervals", () => {
    expect(bootstrapInterval([0, 1, 1, 0], 42, 100)).toEqual(
      bootstrapInterval([0, 1, 1, 0], 42, 100),
    );
  });

  test("tunes abstention thresholds from development results only", () => {
    const developmentCases = benchmarkDataset.cases.filter(
      (retrievalCase) => retrievalCase.split === "development",
    );
    const raw = new Map(
      developmentCases.map((retrievalCase) => [
        retrievalCase.id,
        {
          method: "keyword" as const,
          ranking: retrievalCase.relevantSolutionIds,
          scores: new Map(retrievalCase.relevantSolutionIds.map((id) => [id, 0.8])),
          traces: [],
        },
      ]),
    );
    const calibration = calibrateAbstention("keyword", developmentCases, raw);
    expect(calibration.tunedOnSplit).toBe("development");
    expect(calibration.threshold).toBeGreaterThanOrEqual(0);
    expect(calibration.threshold).toBeLessThanOrEqual(1);
  });

  test("summaries include safety metrics and stable ranking fingerprints", () => {
    const cases = benchmarkDataset.cases.slice(0, 14);
    const results = new Map<string, MethodQueryResult>(
      cases.map((retrievalCase) => [
        retrievalCase.id,
        {
          queryId: retrievalCase.id,
          rawRanking: retrievalCase.relevantSolutionIds,
          returnedIds: retrievalCase.relevantSolutionIds.slice(0, 1),
          abstained: retrievalCase.relevantSolutionIds.length === 0,
          topScore: 0.9,
          explanationTrace: [],
        },
      ]),
    );
    const summary = summarizeMetrics(cases, results, benchmarkDataset.solutions);
    expect(summary.metrics.positiveCases).toBeGreaterThan(0);
    expect(summary.metrics.safeReusePrecisionAt1.value).toBeGreaterThanOrEqual(0);
    expect(summary.metrics.abstentionF1.value).toBeGreaterThanOrEqual(0);
    const fingerprint = repeatabilityFingerprint(new Map([["keyword", results]]));
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).toBe(repeatabilityFingerprint(new Map([["keyword", results]])));
  });
});
