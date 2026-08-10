import { createHash } from "node:crypto";

import { caseExpectedAbstention } from "./fixtures.js";
import { checkStructuredConstraints, type RawMethodResult } from "./retrieval.js";
import type {
  MethodQueryResult,
  MetricWithInterval,
  RetrievalCase,
  RetrievalMetrics,
  RetrievalMethod,
  SolutionFixture,
  ThresholdCalibration,
} from "./types.js";

type MetricRow = Record<
  | "ndcg10"
  | "mrr10"
  | "recall1"
  | "recall3"
  | "recall10"
  | "safeReusePrecisionAt1"
  | "abstentionPrecision"
  | "abstentionRecall"
  | "abstentionF1"
  | "noUsefulMemoryAccuracy"
  | "unsafeReturnRate"
  | "staleFixRate"
  | "wrongVersionRate"
  | "wrongRootCauseRate"
  | "constraintViolationRate",
  number
>;

const METRIC_NAMES: Array<keyof MetricRow> = [
  "ndcg10",
  "mrr10",
  "recall1",
  "recall3",
  "recall10",
  "safeReusePrecisionAt1",
  "abstentionPrecision",
  "abstentionRecall",
  "abstentionF1",
  "noUsefulMemoryAccuracy",
  "unsafeReturnRate",
  "staleFixRate",
  "wrongVersionRate",
  "wrongRootCauseRate",
  "constraintViolationRate",
];

function gain(relevance: number) {
  return 2 ** relevance - 1;
}

export function queryRetrievalMetrics(retrievalCase: RetrievalCase, ranking: readonly string[]) {
  const useful = new Set(retrievalCase.relevantSolutionIds);
  if (useful.size === 0) {
    return { ndcg10: 0, mrr10: 0, recall1: 0, recall3: 0, recall10: 0 };
  }
  const relevance = new Map(
    retrievalCase.relevantSolutionIds.map((id, index) => [id, index === 0 ? 3 : 2]),
  );
  const top = ranking.slice(0, 10);
  const dcg = top.reduce(
    (total, id, index) => total + gain(relevance.get(id) ?? 0) / Math.log2(index + 2),
    0,
  );
  const ideal = [...relevance.values()]
    .sort((left, right) => right - left)
    .slice(0, 10)
    .reduce((total, value, index) => total + gain(value) / Math.log2(index + 2), 0);
  const firstUseful = top.findIndex((id) => useful.has(id));
  const recallAt = (limit: number) =>
    top.slice(0, limit).filter((id) => useful.has(id)).length / useful.size;
  return {
    ndcg10: ideal === 0 ? 0 : dcg / ideal,
    mrr10: firstUseful === -1 ? 0 : 1 / (firstUseful + 1),
    recall1: recallAt(1),
    recall3: recallAt(3),
    recall10: recallAt(10),
  };
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
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function quantile(values: readonly number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

export function bootstrapInterval(
  values: readonly number[],
  seed: number,
  samples = 2000,
): MetricWithInterval {
  const value = mean(values);
  if (!values.length) return { value: 0, low: 0, high: 0 };
  const random = mulberry32(seed);
  const bootstrapped = Array.from({ length: samples }, () =>
    mean(
      Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)]!),
    ),
  );
  return { value, low: quantile(bootstrapped, 0.025), high: quantile(bootstrapped, 0.975) };
}

function resultForCase(
  results: ReadonlyMap<string, MethodQueryResult>,
  retrievalCase: RetrievalCase,
) {
  return (
    results.get(retrievalCase.id) ?? {
      queryId: retrievalCase.id,
      rawRanking: [],
      returnedIds: [],
      abstained: true,
      topScore: 0,
      explanationTrace: [],
    }
  );
}

function topId(result: MethodQueryResult) {
  return result.returnedIds[0];
}

function metricRows(
  cases: readonly RetrievalCase[],
  results: ReadonlyMap<string, MethodQueryResult>,
  solutions: readonly SolutionFixture[],
): MetricRow[] {
  const solutionMap = new Map(solutions.map((solution) => [solution.id, solution]));
  return cases.map((retrievalCase) => {
    const result = resultForCase(results, retrievalCase);
    const retrieval = queryRetrievalMetrics(retrievalCase, result.rawRanking);
    const returned = topId(result);
    const hasReturn = returned !== undefined;
    const isSafeCase = retrievalCase.reuseSafety === "safe";
    const safeCorrect = isSafeCase && retrievalCase.relevantSolutionIds.includes(returned ?? "");
    const expectedAbstention = caseExpectedAbstention(retrievalCase);
    const predictedAbstention = result.abstained || !hasReturn;
    const dangerous = new Set(retrievalCase.dangerousDistractors.map((item) => item.solutionId));
    const unsafeReturn =
      dangerous.has(returned ?? "") ||
      ((retrievalCase.reuseSafety === "unsafe" || retrievalCase.reuseSafety === "none") &&
        hasReturn);
    const stale = retrievalCase.category === "stale-or-reverted" && dangerous.has(returned ?? "");
    const wrongVersion =
      retrievalCase.category === "different-version" && dangerous.has(returned ?? "");
    const wrongRootCause =
      retrievalCase.category === "same-error-different-root-cause" && dangerous.has(returned ?? "");
    const candidate = returned ? solutionMap.get(returned) : undefined;
    const constraintViolation = candidate
      ? !checkStructuredConstraints(candidate, retrievalCase.requiredConstraints).eligible
      : false;
    return {
      ...retrieval,
      safeReusePrecisionAt1: safeCorrect ? 1 : 0,
      abstentionPrecision:
        predictedAbstention && expectedAbstention ? 1 : predictedAbstention ? 0 : 0,
      abstentionRecall: expectedAbstention ? (predictedAbstention ? 1 : 0) : 0,
      abstentionF1: predictedAbstention === expectedAbstention ? 1 : 0,
      noUsefulMemoryAccuracy: retrievalCase.noUsefulMemory ? (predictedAbstention ? 1 : 0) : 0,
      unsafeReturnRate: unsafeReturn ? 1 : 0,
      staleFixRate: stale ? 1 : 0,
      wrongVersionRate: wrongVersion ? 1 : 0,
      wrongRootCauseRate: wrongRootCause ? 1 : 0,
      constraintViolationRate: constraintViolation ? 1 : 0,
    };
  });
}

function rate(values: readonly number[], seed: number) {
  return bootstrapInterval(values, seed);
}

function aggregateInterval(
  cases: readonly RetrievalCase[],
  statistic: (sample: readonly RetrievalCase[]) => number,
  seed: number,
  samples = 2000,
) {
  if (!cases.length) return { value: 0, low: 0, high: 0 } satisfies MetricWithInterval;
  const value = statistic(cases);
  const random = mulberry32(seed);
  const bootstrapped = Array.from({ length: samples }, () =>
    statistic(
      Array.from({ length: cases.length }, () => cases[Math.floor(random() * cases.length)]!),
    ),
  );
  return {
    value,
    low: quantile(bootstrapped, 0.025),
    high: quantile(bootstrapped, 0.975),
  } satisfies MetricWithInterval;
}

function returnedFor(
  retrievalCase: RetrievalCase,
  results: ReadonlyMap<string, MethodQueryResult>,
) {
  const result = resultForCase(results, retrievalCase);
  return { result, top: topId(result), predictedAbstention: result.abstained || !topId(result) };
}

function precisionRate(
  cases: readonly RetrievalCase[],
  predicted: (retrievalCase: RetrievalCase) => boolean,
  correct: (retrievalCase: RetrievalCase) => boolean,
) {
  let denominator = 0;
  let numerator = 0;
  for (const retrievalCase of cases) {
    if (!predicted(retrievalCase)) continue;
    denominator += 1;
    if (correct(retrievalCase)) numerator += 1;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

export function summarizeMetrics(
  cases: readonly RetrievalCase[],
  results: ReadonlyMap<string, MethodQueryResult>,
  solutions: readonly SolutionFixture[],
): { metrics: RetrievalMetrics; rows: MetricRow[] } {
  const rows = metricRows(cases, results, solutions);
  const positiveRows = rows.filter((_, index) => cases[index]!.relevantSolutionIds.length > 0);
  const metric = (name: keyof MetricRow, source = rows, seed = 20_260_801) =>
    rate(
      source.map((row) => row[name]),
      seed + METRIC_NAMES.indexOf(name),
    );
  const safeCases = cases;
  const expectedAbstentionCases = cases;
  const safePrecision = (sample: readonly RetrievalCase[]) =>
    precisionRate(
      sample,
      (retrievalCase) => Boolean(topId(resultForCase(results, retrievalCase))),
      (retrievalCase) =>
        retrievalCase.reuseSafety === "safe" &&
        retrievalCase.relevantSolutionIds.includes(
          topId(resultForCase(results, retrievalCase)) ?? "",
        ),
    );
  const abstentionPrecision = (sample: readonly RetrievalCase[]) =>
    precisionRate(
      sample,
      (retrievalCase) => returnedFor(retrievalCase, results).predictedAbstention,
      caseExpectedAbstention,
    );
  const abstentionRecall = (sample: readonly RetrievalCase[]) => {
    const actual = sample.filter(caseExpectedAbstention).length;
    const truePositive = sample.filter((retrievalCase) => {
      const { predictedAbstention } = returnedFor(retrievalCase, results);
      return caseExpectedAbstention(retrievalCase) && predictedAbstention;
    }).length;
    return actual === 0 ? 0 : truePositive / actual;
  };
  const abstentionF1 = (sample: readonly RetrievalCase[]) => {
    const precision = abstentionPrecision(sample);
    return f1(precision, abstentionRecall(sample));
  };
  const noUsefulAccuracy = (sample: readonly RetrievalCase[]) => {
    const noUseful = sample.filter((retrievalCase) => retrievalCase.noUsefulMemory);
    if (!noUseful.length) return 0;
    return (
      noUseful.filter((retrievalCase) => returnedFor(retrievalCase, results).predictedAbstention)
        .length / noUseful.length
    );
  };
  return {
    metrics: {
      positiveCases: positiveRows.length,
      ndcg10: metric("ndcg10", positiveRows),
      mrr10: metric("mrr10", positiveRows),
      recall1: metric("recall1", positiveRows),
      recall3: metric("recall3", positiveRows),
      recall10: metric("recall10", positiveRows),
      safeReusePrecisionAt1: aggregateInterval(safeCases, safePrecision, 20_261_101),
      abstentionPrecision: aggregateInterval(
        expectedAbstentionCases,
        abstentionPrecision,
        20_261_102,
      ),
      abstentionRecall: aggregateInterval(expectedAbstentionCases, abstentionRecall, 20_261_103),
      abstentionF1: aggregateInterval(expectedAbstentionCases, abstentionF1, 20_261_104),
      noUsefulMemoryAccuracy: aggregateInterval(
        expectedAbstentionCases,
        noUsefulAccuracy,
        20_261_105,
      ),
      unsafeReturnRate: metric(
        "unsafeReturnRate",
        cases
          .filter((item) => item.category !== "direct-reuse")
          .map((item) => rows[cases.indexOf(item)]!),
      ),
      staleFixRate: metric(
        "staleFixRate",
        cases
          .filter((item) => item.category === "stale-or-reverted")
          .map((item) => rows[cases.indexOf(item)]!),
      ),
      wrongVersionRate: metric(
        "wrongVersionRate",
        cases
          .filter((item) => item.category === "different-version")
          .map((item) => rows[cases.indexOf(item)]!),
      ),
      wrongRootCauseRate: metric(
        "wrongRootCauseRate",
        cases
          .filter((item) => item.category === "same-error-different-root-cause")
          .map((item) => rows[cases.indexOf(item)]!),
      ),
      constraintViolationRate: metric("constraintViolationRate"),
    },
    rows,
  };
}

function f1(precision: number, recall: number) {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function thresholdStats(
  cases: readonly RetrievalCase[],
  rawResults: ReadonlyMap<string, RawMethodResult>,
  threshold: number,
) {
  let truePositive = 0;
  let predictedPositive = 0;
  let actualPositive = 0;
  let noUsefulCorrect = 0;
  let noUsefulTotal = 0;
  for (const retrievalCase of cases) {
    const raw = rawResults.get(retrievalCase.id)!;
    const topScore = raw.ranking.length ? (raw.scores.get(raw.ranking[0]!) ?? 0) : 0;
    const predictedAbstention = raw.ranking.length === 0 || topScore < threshold;
    const expectedAbstention = caseExpectedAbstention(retrievalCase);
    if (predictedAbstention) predictedPositive += 1;
    if (expectedAbstention) actualPositive += 1;
    if (predictedAbstention && expectedAbstention) truePositive += 1;
    if (retrievalCase.noUsefulMemory) {
      noUsefulTotal += 1;
      if (predictedAbstention) noUsefulCorrect += 1;
    }
  }
  const precision = predictedPositive === 0 ? 0 : truePositive / predictedPositive;
  const recall = actualPositive === 0 ? 0 : truePositive / actualPositive;
  return {
    f1: f1(precision, recall),
    noUsefulMemoryAccuracy: noUsefulTotal === 0 ? 0 : noUsefulCorrect / noUsefulTotal,
  };
}

export function calibrateAbstention(
  method: RetrievalMethod,
  developmentCases: readonly RetrievalCase[],
  rawResults: ReadonlyMap<string, RawMethodResult>,
): ThresholdCalibration {
  const candidates = [
    0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85,
    0.9, 0.95,
  ];
  const best = candidates
    .map((threshold) => ({ threshold, ...thresholdStats(developmentCases, rawResults, threshold) }))
    .sort(
      (left, right) =>
        right.f1 - left.f1 ||
        right.noUsefulMemoryAccuracy - left.noUsefulMemoryAccuracy ||
        right.threshold - left.threshold,
    )[0]!;
  return {
    method,
    threshold: best.threshold,
    developmentF1: best.f1,
    developmentNoUsefulAccuracy: best.noUsefulMemoryAccuracy,
    tunedOnSplit: "development",
  };
}

export function repeatabilityFingerprint(
  results: ReadonlyMap<string, ReadonlyMap<string, MethodQueryResult>>,
) {
  const stable = [...results.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([method, queries]) => [
      method,
      [...queries.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([queryId, result]) => [
          queryId,
          result.rawRanking,
          result.returnedIds,
          result.abstained,
        ]),
    ]);
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}
