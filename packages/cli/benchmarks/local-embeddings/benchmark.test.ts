import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import { benchmarkCorpus, validateBenchmarkCorpus } from "./corpus";
import { queryMetrics, summarizeMetrics } from "./metrics";
import { BENCHMARK_MODELS } from "./models";
import { formatDocument, formatQuery, QWEN_QUERY_INSTRUCTION } from "./profiles";
import { evaluateRetrievalGate } from "./quality-gate";

describe("local embedding benchmark", () => {
  test("has the planned corpus shape and valid graded labels", () => {
    expect(() => validateBenchmarkCorpus(benchmarkCorpus)).not.toThrow();
    expect(benchmarkCorpus.documents).toHaveLength(200);
    expect(benchmarkCorpus.queries).toHaveLength(100);
    expect(Object.groupBy(benchmarkCorpus.queries, (query) => query.language)).toMatchObject({
      en: expect.arrayContaining([expect.any(Object)]),
      fr: expect.arrayContaining([expect.any(Object)]),
      ar: expect.arrayContaining([expect.any(Object)]),
    });
    expect(benchmarkCorpus.queries.filter((query) => query.language === "en")).toHaveLength(80);
    expect(benchmarkCorpus.queries.filter((query) => query.language === "fr")).toHaveLength(10);
    expect(benchmarkCorpus.queries.filter((query) => query.language === "ar")).toHaveLength(10);
    expect(
      benchmarkCorpus.queries.filter((query) => query.expectedRetrieval === "exact"),
    ).toHaveLength(20);
    expect(benchmarkCorpus.queries.filter((query) => query.lexicalAnchor === false)).toHaveLength(
      10,
    );
  });

  test("enforces the hosted RRF promotion thresholds", () => {
    const query = benchmarkCorpus.queries[0]!;
    const decisive = Object.entries(query.relevance).find(([, grade]) => grade === 3)![0];
    const baseline = new Map([[query.id, []]]);
    const candidate = new Map([[query.id, [decisive]]]);
    expect(evaluateRetrievalGate([query], baseline, candidate)).toMatchObject({ passed: true });
    expect(evaluateRetrievalGate([query], candidate, baseline)).toMatchObject({ passed: false });
  });

  test("uses model-native document and query formats", () => {
    const document = benchmarkCorpus.documents[0]!;
    expect(formatDocument("nomic", "native", document)).toMatch(/^search_document: Tags:/);
    expect(formatDocument("nomic", "raw", document)).toMatch(/^Tags:/);
    expect(formatDocument("qwen", "native", document)).toBe(
      formatDocument("qwen", "raw", document),
    );
    expect(formatQuery("nomic", "native", " query ")).toBe("search_query: query");
    expect(formatQuery("qwen", "native", " query ")).toBe(
      `Instruct: ${QWEN_QUERY_INSTRUCTION}\nQuery:query`,
    );
    expect(formatQuery("bge", "native", " query ")).toBe("query");
  });

  test("computes retrieval metrics and deterministic confidence intervals", () => {
    const query = benchmarkCorpus.queries[0]!;
    const decisive = Object.entries(query.relevance).find(([, grade]) => grade === 3)![0];
    const poor = queryMetrics(query, ["not-relevant", decisive]);
    expect(poor.mrr10).toBe(0.5);
    expect(poor.recall1).toBe(0);
    expect(poor.recall3).toBe(1);

    const rankings = new Map(
      benchmarkCorpus.queries.map((item) => [item.id, Object.keys(item.relevance)]),
    );
    expect(summarizeMetrics(benchmarkCorpus.queries, rankings, 100, 42)).toEqual(
      summarizeMetrics(benchmarkCorpus.queries, rankings, 100, 42),
    );
  });

  test("pins immutable model artifacts with sha256 hashes", () => {
    for (const model of Object.values(BENCHMARK_MODELS)) {
      expect(model.url).toContain("/resolve/");
      expect(model.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(model.size).toBeGreaterThan(30_000_000);
      expect(createHash("sha256").update(model.sha256).digest("hex")).toHaveLength(64);
    }
  });
});
