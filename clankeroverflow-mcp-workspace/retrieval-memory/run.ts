import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { benchmarkDataset } from "./fixtures.js";
import { calibrateAbstention, repeatabilityFingerprint, summarizeMetrics } from "./metrics.js";
import { formatReport } from "./report.js";
import {
  createBenchmarkIndex,
  retrieveCase,
  resultForCase,
  type RawMethodResult,
} from "./retrieval.js";
import {
  CASE_CATEGORIES,
  type BenchmarkRun,
  type MethodRun,
  type RetrievalCase,
  type Split,
} from "./types.js";
import { validateBenchmarkDataset } from "./validate.js";

type BenchmarkOptions = {
  split: "development" | "test" | "all";
  output: string;
  report: string;
  writeFixtures?: string;
};

function optionValue(args: readonly string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function parseSplit(value: string | undefined): BenchmarkOptions["split"] {
  const split = value ?? "test";
  if (split !== "development" && split !== "test" && split !== "all") {
    throw new Error(`--split must be development, test, or all; received ${split}`);
  }
  return split;
}

function defaultOutput(split: string) {
  return resolve(
    process.cwd(),
    "clankeroverflow-mcp-workspace/retrieval-memory/results",
    `memory-retrieval-${split}.json`,
  );
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
  const split = parseSplit(optionValue(args, "--split"));
  const output = resolve(optionValue(args, "--output") ?? defaultOutput(split));
  return {
    split,
    output,
    report: resolve(optionValue(args, "--report") ?? output.replace(/\.json$/i, ".md")),
    writeFixtures: optionValue(args, "--write-fixtures"),
  };
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

function percentile(values: readonly number[], q: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

function casesForSplit(split: Split) {
  return benchmarkDataset.cases.filter((retrievalCase) => retrievalCase.split === split);
}

async function evaluateRaw(
  index: Awaited<ReturnType<typeof createBenchmarkIndex>>,
  cases: readonly RetrievalCase[],
) {
  const results = new Map<string, RawMethodResult>();
  const latencyMs: number[] = [];
  for (const retrievalCase of cases) {
    const started = performance.now();
    results.set(retrievalCase.id, await retrieveCase(index, retrievalCase, "keyword"));
    latencyMs.push(performance.now() - started);
  }
  return { results, latencyMs };
}

function categoryMetrics(
  cases: readonly RetrievalCase[],
  results: ReadonlyMap<string, ReturnType<typeof resultForCase>>,
) {
  return Object.fromEntries(
    CASE_CATEGORIES.map((category) => {
      const selected = cases.filter((retrievalCase) => retrievalCase.category === category);
      const selectedResults = new Map(
        selected.map((retrievalCase) => [retrievalCase.id, results.get(retrievalCase.id)!]),
      );
      return [
        category,
        summarizeMetrics(selected, selectedResults, benchmarkDataset.solutions).metrics,
      ];
    }),
  ) as MethodRun["categoryMetrics"];
}

export async function runMemoryRetrievalBenchmark(
  options: Partial<BenchmarkOptions> = {},
): Promise<BenchmarkRun> {
  const split = options.split ?? "test";
  const output = options.output ?? defaultOutput(split);
  const report = options.report ?? output.replace(/\.json$/i, ".md");
  validateBenchmarkDataset(benchmarkDataset);
  const index = await createBenchmarkIndex(benchmarkDataset);
  try {
    const developmentCases = casesForSplit("development");
    const testCases = casesForSplit("test");
    const development = await evaluateRaw(index, developmentCases);
    const threshold = calibrateAbstention("keyword", developmentCases, development.results);
    const targetSplits: Split[] = split === "all" ? ["development", "test"] : [split];
    const rawBySplit = new Map<Split, Awaited<ReturnType<typeof evaluateRaw>>>([
      ["development", development],
    ]);
    if (targetSplits.includes("test")) rawBySplit.set("test", await evaluateRaw(index, testCases));
    const methods: MethodRun[] = [];
    const fingerprints = new Map<string, ReadonlyMap<string, ReturnType<typeof resultForCase>>>();
    for (const targetSplit of targetSplits) {
      const cases = targetSplit === "development" ? developmentCases : testCases;
      const raw = rawBySplit.get(targetSplit)!;
      const finalResults = new Map(
        cases.map((retrievalCase) => [
          retrievalCase.id,
          resultForCase(raw.results.get(retrievalCase.id)!, retrievalCase, threshold.threshold),
        ]),
      );
      const latency = raw.latencyMs.slice(1);
      methods.push({
        method: "keyword",
        split: targetSplit,
        candidatePoolSize: index.solutions.length,
        latency: {
          coldStartMs: raw.latencyMs[0] ?? 0,
          warmMedianMs: median(latency),
          warmP95Ms: percentile(latency, 0.95),
        },
        implementation: "LocalBackend SQLite FTS5 tiered keyword search",
        calibration: threshold,
        metrics: summarizeMetrics(cases, finalResults, index.solutions).metrics,
        categoryMetrics: categoryMetrics(cases, finalResults),
        queries: [...finalResults.values()],
      });
      fingerprints.set(`${targetSplit}:keyword`, finalResults);
    }
    const result: BenchmarkRun = {
      benchmark: "ClankerOverflow Memory Retrieval Benchmark",
      version: 1,
      split,
      dataset: {
        families: benchmarkDataset.families.length,
        solutions: benchmarkDataset.solutions.length,
        cases: benchmarkDataset.cases.length,
        developmentCases: developmentCases.length,
        testCases: testCases.length,
        casesPerCategory: Object.fromEntries(
          CASE_CATEGORIES.map((category) => [
            category,
            benchmarkDataset.cases.filter((item) => item.category === category).length,
          ]),
        ) as BenchmarkRun["dataset"]["casesPerCategory"],
        repeatabilityFingerprint: repeatabilityFingerprint(fingerprints),
      },
      thresholds: [threshold],
      methods,
      warnings: ["This v2 regression suite evaluates keyword retrieval only."],
      artifacts: { jsonPath: resolve(output), markdownPath: resolve(report) },
    };
    if (options.writeFixtures) {
      mkdirSync(dirname(resolve(options.writeFixtures)), { recursive: true });
      writeFileSync(
        resolve(options.writeFixtures),
        `${JSON.stringify(benchmarkDataset, null, 2)}\n`,
      );
    }
    mkdirSync(dirname(resolve(output)), { recursive: true });
    mkdirSync(dirname(resolve(report)), { recursive: true });
    writeFileSync(resolve(output), `${JSON.stringify(result)}\n`);
    writeFileSync(resolve(report), formatReport(result));
    return result;
  } finally {
    index.close();
  }
}

function printUsage() {
  console.log(`Usage: pnpm eval:memory-retrieval [options]

Options:
  --split development|test|all  Report split (default: test; dev calibrates abstention)
  --output <path>               Raw JSON result path
  --report <path>               Markdown report path
  --write-fixtures <path>       Write the validated dataset snapshot
`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) printUsage();
  else console.log(formatReport(await runMemoryRetrievalBenchmark(parseOptions(args))));
}
