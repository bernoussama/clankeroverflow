import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { LocalBackend } from "../../packages/cli/src/mcp/local-backend.js";
import { percentile, summarizeMetrics } from "./metrics.js";
import { formatReport } from "./report.js";
import type {
  DatasetManifest,
  MethodName,
  MetricSummary,
  StackOverflowQuery,
  StackOverflowSolution,
} from "./types.js";

type RankingMap = Map<string, string[]>;
const METHODS = ["exact", "tiered"] as const;

function readJsonLines<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function keywordSafeQuery(text: string) {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).join(" ");
}

function solutionProblem(solution: StackOverflowSolution) {
  return `${solution.title}\n\n${solution.questionText}`;
}

function percentileSummary(values: number[]) {
  return { p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95) };
}

function metricSlices(queries: StackOverflowQuery[], rankings: Record<MethodName, RankingMap>) {
  const slices = new Map<string, StackOverflowQuery[]>();
  for (const query of queries.filter((item) => item.split === "test")) {
    for (const key of [`tag:${query.primaryTag}`, `date:${query.dateBucket}`]) {
      slices.set(key, [...(slices.get(key) ?? []), query]);
    }
  }
  return Object.fromEntries(
    [...slices.entries()]
      .filter(([, values]) => values.length >= 20)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [
        `${key} (n=${values.length})`,
        Object.fromEntries(
          METHODS.map((method) => [method, summarizeMetrics(values, rankings[method], 1_000)]),
        ) as Record<MethodName, MetricSummary>,
      ]),
  );
}

function parseOptions(args: string[]) {
  const value = (name: string, fallback: string) => {
    const index = args.indexOf(name);
    if (index === -1) return fallback;
    const selected = args[index + 1];
    if (!selected || selected.startsWith("--")) throw new Error(`${name} requires a value`);
    return selected;
  };
  const root = dirname(new URL(import.meta.url).pathname);
  return {
    dataDirectory: resolve(value("--data", join(root, "data"))),
    output: resolve(value("--output", join(root, "results/benchmark.json"))),
    report: resolve(value("--report", join(root, "results/benchmark.md"))),
  };
}

function remap(rows: Array<{ id: string }>, ids: ReadonlyMap<string, string>) {
  return rows.map((row) => ids.get(row.id) ?? row.id);
}

export async function runBenchmark(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const manifest = JSON.parse(
    readFileSync(join(options.dataDirectory, "manifest.json"), "utf8"),
  ) as DatasetManifest;
  if (manifest.version !== 2) {
    throw new Error("Prepared artifacts use an older schema; rerun dataset preparation");
  }
  const solutions = readJsonLines<StackOverflowSolution>(
    join(options.dataDirectory, "solutions.jsonl"),
  );
  const queries = readJsonLines<StackOverflowQuery>(join(options.dataDirectory, "queries.jsonl"));
  if (
    solutions.length !== manifest.counts.solutions ||
    queries.length !== manifest.counts.queries
  ) {
    throw new Error("Prepared artifacts do not match manifest counts; rerun dataset preparation");
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "clanker-stackoverflow-benchmark-"));
  const backend = new LocalBackend(join(temporaryDirectory, "benchmark.sqlite"));
  const ids = new Map<string, string>();
  try {
    const indexStarted = performance.now();
    for (const [index, solution] of solutions.entries()) {
      const logged = await backend.log({
        problem: solutionProblem(solution),
        solution: solution.answerText,
        tags: solution.tags.join(","),
      });
      ids.set(logged.id, solution.id);
      if ((index + 1) % 250 === 0) console.log(`  inserted ${index + 1}/${solutions.length}`);
    }
    const indexMs = performance.now() - indexStarted;
    const rankings = Object.fromEntries(METHODS.map((method) => [method, new Map()])) as Record<
      MethodName,
      RankingMap
    >;
    const latencies = { exact: [] as number[], tiered: [] as number[] };

    for (const [index, query] of queries.entries()) {
      const safeQuery = keywordSafeQuery(query.text);
      for (const method of METHODS) {
        const started = performance.now();
        const results = await backend.search({
          query: safeQuery,
          limit: 10,
          keywordStrategy: method,
        });
        latencies[method].push(performance.now() - started);
        rankings[method].set(query.id, remap(results, ids));
      }
      if ((index + 1) % 100 === 0) console.log(`  evaluated ${index + 1}/${queries.length}`);
    }

    const splitQueries = {
      development: queries.filter((query) => query.split === "development"),
      test: queries.filter((query) => query.split === "test"),
    };
    const methods = Object.fromEntries(
      METHODS.map((method) => [
        method,
        {
          metrics: {
            development: summarizeMetrics(splitQueries.development, rankings[method]),
            test: summarizeMetrics(splitQueries.test, rankings[method]),
          },
          latency: percentileSummary(latencies[method]),
        },
      ]),
    ) as Record<
      MethodName,
      {
        metrics: { development: MetricSummary; test: MetricSummary };
        latency: { p50Ms: number; p95Ms: number };
      }
    >;
    const serializedRankings = Object.fromEntries(
      METHODS.map((method) => [method, Object.fromEntries(rankings[method])]),
    );
    const rankingFingerprint = createHash("sha256")
      .update(JSON.stringify(serializedRankings))
      .digest("hex");
    const generatedAt = new Date().toISOString();
    const result = {
      version: 2,
      generatedAt,
      corpus: {
        manifest,
        developmentQueries: splitQueries.development.length,
        testQueries: splitQueries.test.length,
      },
      retrieval: {
        implementation: "LocalBackend production SQLite FTS5 keyword retrieval",
        keywordQueryNormalization: "lowercase Unicode word tokens at benchmark adapter boundary",
        limit: 10,
      },
      timing: { indexMs },
      methods,
      testSlices: metricSlices(queries, rankings),
      rankingFingerprint,
      rankings: serializedRankings,
    };
    mkdirSync(dirname(options.output), { recursive: true });
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(
      options.report,
      formatReport({
        generatedAt,
        corpus: {
          solutions: solutions.length,
          queries: queries.length,
          developmentQueries: splitQueries.development.length,
          testQueries: splitQueries.test.length,
          redistributionReady: manifest.licenses.redistributionReady,
          relationshipsMissingProvenance: manifest.licenses.relationshipsMissingProvenance,
        },
        indexMs,
        methods,
        testSlices: metricSlices(queries, rankings),
        rankingFingerprint,
      }),
    );
    console.log(`Results: ${options.output}`);
    console.log(`Report: ${options.report}`);
    return result;
  } finally {
    backend.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await runBenchmark();
}
