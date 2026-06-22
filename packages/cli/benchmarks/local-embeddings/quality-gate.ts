import { queryMetrics, type MetricName } from "./metrics";
import type { BenchmarkQuery } from "./types";

export type RetrievalGateResult = {
  passed: boolean;
  failures: string[];
  deltas: Record<MetricName, number>;
  sliceNdcgDeltas: Record<string, number>;
};

const mean = (values: number[]) =>
  values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);

export function evaluateRetrievalGate(
  queries: readonly BenchmarkQuery[],
  baseline: ReadonlyMap<string, readonly string[]>,
  candidate: ReadonlyMap<string, readonly string[]>,
): RetrievalGateResult {
  const names: MetricName[] = ["ndcg10", "mrr10", "recall1", "recall3", "recall10"];
  const baselineRows = queries.map((query) => queryMetrics(query, baseline.get(query.id) ?? []));
  const candidateRows = queries.map((query) => queryMetrics(query, candidate.get(query.id) ?? []));
  const deltas = Object.fromEntries(
    names.map((name) => [
      name,
      mean(candidateRows.map((row) => row[name])) - mean(baselineRows.map((row) => row[name])),
    ]),
  ) as Record<MetricName, number>;
  const slices = [
    ...new Set(queries.map((query) => `category:${query.category}`)),
    ...new Set(queries.map((query) => `language:${query.language}`)),
  ];
  const sliceNdcgDeltas = Object.fromEntries(
    slices.map((slice) => {
      const indexes = queries.flatMap((query, index) => {
        const value = slice.startsWith("category:") ? query.category : query.language;
        return value === slice.slice(slice.indexOf(":") + 1) ? [index] : [];
      });
      return [
        slice,
        mean(indexes.map((index) => candidateRows[index]!.ndcg10)) -
          mean(indexes.map((index) => baselineRows[index]!.ndcg10)),
      ];
    }),
  );
  const failures: string[] = [];
  if (deltas.ndcg10 < 0.01)
    failures.push(`overall nDCG@10 delta ${deltas.ndcg10.toFixed(4)} < 0.0100`);
  if (deltas.mrr10 < -0.005)
    failures.push(`overall MRR@10 delta ${deltas.mrr10.toFixed(4)} < -0.0050`);
  if (deltas.recall10 < -0.005)
    failures.push(`overall Recall@10 delta ${deltas.recall10.toFixed(4)} < -0.0050`);
  for (const [slice, delta] of Object.entries(sliceNdcgDeltas)) {
    if (delta < -0.03) failures.push(`${slice} nDCG@10 delta ${delta.toFixed(4)} < -0.0300`);
  }
  return { passed: failures.length === 0, failures, deltas, sliceNdcgDeltas };
}
