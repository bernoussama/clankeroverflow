import type { MetricName, MetricSummary, StackOverflowQuery } from "./types.js";

export function queryMetrics(query: StackOverflowQuery, ranking: readonly string[]) {
  const relevant = new Set(query.relevantSolutionIds);
  const top = ranking.slice(0, 10);
  const firstRelevant = top.findIndex((id) => relevant.has(id));
  const dcg = top.reduce(
    (total, id, index) => total + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0),
    0,
  );
  const ideal = Array.from(
    { length: Math.min(10, query.relevantSolutionIds.length) },
    (_, index) => 1 / Math.log2(index + 2),
  ).reduce((total, value) => total + value, 0);
  const hit = (limit: number) => (top.slice(0, limit).some((id) => relevant.has(id)) ? 1 : 0);
  const recall = (limit: number) =>
    top.slice(0, limit).filter((id) => relevant.has(id)).length / Math.max(1, relevant.size);
  return {
    hit1: hit(1),
    hit5: hit(5),
    hit10: hit(10),
    recall1: recall(1),
    recall5: recall(5),
    recall10: recall(10),
    mrr10: firstRelevant === -1 ? 0 : 1 / (firstRelevant + 1),
    ndcg10: ideal ? dcg / ideal : 0,
  } satisfies Record<MetricName, number>;
}

function randomGenerator(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function mean(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function quantile(values: readonly number[], q: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

export function summarizeMetrics(
  queries: readonly StackOverflowQuery[],
  rankings: ReadonlyMap<string, readonly string[]>,
  samples = 2_000,
): MetricSummary {
  if (!queries.length) throw new Error("Cannot summarize an empty query set");
  const rows = queries.map((query) => queryMetrics(query, rankings.get(query.id) ?? []));
  const random = randomGenerator(20_260_810);
  const names: MetricName[] = [
    "hit1",
    "hit5",
    "hit10",
    "recall1",
    "recall5",
    "recall10",
    "mrr10",
    "ndcg10",
  ];
  return Object.fromEntries(
    names.map((name) => {
      const bootstrapped = Array.from({ length: samples }, () =>
        mean(
          Array.from(
            { length: rows.length },
            () => rows[Math.floor(random() * rows.length)]![name],
          ),
        ),
      );
      return [
        name,
        {
          value: mean(rows.map((row) => row[name])),
          low: quantile(bootstrapped, 0.025),
          high: quantile(bootstrapped, 0.975),
        },
      ];
    }),
  ) as MetricSummary;
}

export function percentile(values: readonly number[], q: number) {
  return quantile(values, q);
}
