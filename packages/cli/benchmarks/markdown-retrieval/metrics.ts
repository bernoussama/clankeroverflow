import type { BenchmarkQuery } from "./types";

export type MetricName = "ndcg10" | "mrr10" | "recall1" | "recall3" | "recall10";
export type MetricSummary = Record<MetricName, { value: number; low: number; high: number }>;

function gain(relevance: number) {
  return 2 ** relevance - 1;
}

export function queryMetrics(query: BenchmarkQuery, ranking: readonly string[]) {
  const top = ranking.slice(0, 10);
  const dcg = top.reduce(
    (total, id, index) => total + gain(query.relevance[id] ?? 0) / Math.log2(index + 2),
    0,
  );
  const ideal = Object.values(query.relevance)
    .sort((a, b) => b - a)
    .slice(0, 10)
    .reduce((total, relevance, index) => total + gain(relevance) / Math.log2(index + 2), 0);
  const useful = new Set(
    Object.entries(query.relevance)
      .filter(([, relevance]) => relevance >= 2)
      .map(([id]) => id),
  );
  const firstUseful = top.findIndex((id) => useful.has(id));
  const recallAt = (limit: number) =>
    useful.size === 0 ? 0 : top.slice(0, limit).filter((id) => useful.has(id)).length / useful.size;
  return {
    ndcg10: ideal === 0 ? 0 : dcg / ideal,
    mrr10: firstUseful === -1 ? 0 : 1 / (firstUseful + 1),
    recall1: recallAt(1),
    recall3: recallAt(3),
    recall10: recallAt(10),
  } satisfies Record<MetricName, number>;
}

function mulberry32(seed: number) {
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
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

export function summarizeMetrics(
  queries: readonly BenchmarkQuery[],
  rankings: ReadonlyMap<string, readonly string[]>,
  bootstrapSamples = 10_000,
  seed = 20_260_621,
): MetricSummary {
  if (queries.length === 0) throw new Error("Cannot summarize an empty query set");
  if (!Number.isInteger(bootstrapSamples) || bootstrapSamples < 1) {
    throw new Error("bootstrapSamples must be an integer >= 1");
  }
  const rows = queries.map((query) => queryMetrics(query, rankings.get(query.id) ?? []));
  const random = mulberry32(seed);
  const names: MetricName[] = ["ndcg10", "mrr10", "recall1", "recall3", "recall10"];
  return Object.fromEntries(
    names.map((name) => {
      const samples = Array.from({ length: bootstrapSamples }, () =>
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
          low: quantile(samples, 0.025),
          high: quantile(samples, 0.975),
        },
      ];
    }),
  ) as MetricSummary;
}

export function percentile(values: readonly number[], q: number) {
  return quantile(values, q);
}
