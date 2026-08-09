import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { benchmarkDataset } from "./fixtures.js";
import { calibrateAbstention, repeatabilityFingerprint, summarizeMetrics } from "./metrics.js";
import { formatReport } from "./report.js";
import {
  buildReranker,
  createBenchmarkIndex,
  retrieveCase,
  resultForCase,
  type EmbeddingMode,
  type RawMethodResult,
  type RetrievalOptions,
} from "./retrieval.js";
import {
  CASE_CATEGORIES,
  RETRIEVAL_METHODS,
  type BenchmarkRun,
  type MethodRun,
  type RetrievalCase,
  type RetrievalMethod,
  type Split,
} from "./types.js";
import { validateBenchmarkDataset } from "./validate.js";

type BenchmarkOptions = {
  split: "development" | "test" | "all";
  methods: RetrievalMethod[];
  output: string;
  report: string;
  cacheDir: string;
  offline: boolean;
  embeddingMode: EmbeddingMode;
  embeddingModelPath?: string;
  rerankerMode: "fixture" | "transformers";
  rerankerFixturePath?: string;
  writeFixtures?: string;
};

type RawEvaluation = {
  results: Map<string, RawMethodResult>;
  latencyMs: number[];
};

function optionValue(args: readonly string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function parseMethods(value: string | undefined) {
  if (!value) return [...RETRIEVAL_METHODS];
  const methods = value.split(",").map((method) => method.trim()) as RetrievalMethod[];
  for (const method of methods) {
    if (!RETRIEVAL_METHODS.includes(method)) throw new Error(`Unknown retrieval method: ${method}`);
  }
  return [...new Set(methods)];
}

function parseSplit(value: string | undefined): "development" | "test" | "all" {
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
  const output = resolve(
    optionValue(args, "--output") ?? defaultOutput(parseSplit(optionValue(args, "--split"))),
  );
  const report = resolve(optionValue(args, "--report") ?? output.replace(/\.json$/i, ".md"));
  const cacheDir = resolve(
    optionValue(args, "--model-cache") ??
      process.env.CLANKER_MEMORY_BENCHMARK_CACHE ??
      join(process.cwd(), ".cache/clankeroverflow-memory-retrieval"),
  );
  const embeddingMode = (optionValue(args, "--embedding-mode") ?? "deterministic") as EmbeddingMode;
  if (embeddingMode !== "deterministic" && embeddingMode !== "local") {
    throw new Error("--embedding-mode must be deterministic or local");
  }
  const rerankerMode = (optionValue(args, "--reranker-mode") ?? "fixture") as
    | "fixture"
    | "transformers";
  if (rerankerMode !== "fixture" && rerankerMode !== "transformers") {
    throw new Error("--reranker-mode must be fixture or transformers");
  }
  return {
    split: parseSplit(optionValue(args, "--split")),
    methods: parseMethods(optionValue(args, "--methods")),
    output,
    report,
    cacheDir,
    offline: args.includes("--offline"),
    embeddingMode,
    embeddingModelPath: optionValue(args, "--embedding-model"),
    rerankerMode,
    rerankerFixturePath: optionValue(args, "--reranker-fixtures"),
    writeFixtures: optionValue(args, "--write-fixtures"),
  };
}

function median(values: readonly number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

function percentile(values: readonly number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

function casesForSplit(split: Split, cases: readonly RetrievalCase[]) {
  return cases.filter((retrievalCase) => retrievalCase.split === split);
}

async function evaluateRaw(
  index: Awaited<ReturnType<typeof createBenchmarkIndex>>,
  cases: readonly RetrievalCase[],
  method: RetrievalMethod,
  retrievalOptions: RetrievalOptions,
): Promise<RawEvaluation> {
  const results = new Map<string, RawMethodResult>();
  const latencyMs: number[] = [];
  for (const retrievalCase of cases) {
    const started = performance.now();
    results.set(
      retrievalCase.id,
      await retrieveCase(index, retrievalCase, method, retrievalOptions),
    );
    latencyMs.push(performance.now() - started);
  }
  return { results, latencyMs };
}

function categoryMetrics(
  cases: readonly RetrievalCase[],
  results: ReadonlyMap<string, ReturnType<typeof resultForCase>>,
  solutions: Awaited<ReturnType<typeof createBenchmarkIndex>>["solutions"],
) {
  return Object.fromEntries(
    CASE_CATEGORIES.map((category) => {
      const categoryCases = cases.filter((retrievalCase) => retrievalCase.category === category);
      const categoryResults = new Map(
        categoryCases.map((retrievalCase) => [retrievalCase.id, results.get(retrievalCase.id)!]),
      );
      return [category, summarizeMetrics(categoryCases, categoryResults, solutions).metrics];
    }),
  ) as MethodRun["categoryMetrics"];
}

function modelIdentity(
  options: BenchmarkOptions,
  reranker: Awaited<ReturnType<typeof buildReranker>>,
) {
  return {
    embedding:
      options.embeddingMode === "local" ? "bge-small-en-v1.5-q8_0" : "deterministic-hash-v1",
    reranker: reranker.modelId,
    rerankerRevision: reranker.revision,
    cacheDir: options.cacheDir,
    offline: options.offline,
  };
}

export async function runMemoryRetrievalBenchmark(
  options: Partial<BenchmarkOptions> = {},
): Promise<BenchmarkRun> {
  const resolved: BenchmarkOptions = {
    split: options.split ?? "test",
    methods: options.methods ?? [...RETRIEVAL_METHODS],
    output: options.output ?? defaultOutput(options.split ?? "test"),
    report:
      options.report ??
      (options.output ?? defaultOutput(options.split ?? "test")).replace(/\.json$/i, ".md"),
    cacheDir: options.cacheDir ?? join(process.cwd(), ".cache/clankeroverflow-memory-retrieval"),
    offline: options.offline ?? false,
    embeddingMode: options.embeddingMode ?? "deterministic",
    embeddingModelPath: options.embeddingModelPath,
    rerankerMode: options.rerankerMode ?? "fixture",
    rerankerFixturePath: options.rerankerFixturePath,
    writeFixtures: options.writeFixtures,
  };
  validateBenchmarkDataset(benchmarkDataset);
  if (!resolved.methods.length) throw new Error("At least one retrieval method is required");
  const reranker = await buildReranker({
    mode: resolved.rerankerMode,
    cacheDir: resolved.cacheDir,
    offline: resolved.offline,
    fixturePath: resolved.rerankerFixturePath,
  });
  const index = await createBenchmarkIndex(benchmarkDataset, {
    embeddingMode: resolved.embeddingMode,
    embeddingModelPath: resolved.embeddingModelPath,
    methods: resolved.methods,
  });
  try {
    const developmentCases = casesForSplit("development", benchmarkDataset.cases);
    const testCases = casesForSplit("test", benchmarkDataset.cases);
    const retrievalOptions: RetrievalOptions = {
      embeddingMode: resolved.embeddingMode,
      embeddingModelPath: resolved.embeddingModelPath,
      reranker,
      methods: resolved.methods,
    };
    const developmentRaw = new Map<RetrievalMethod, RawEvaluation>();
    const testRaw = new Map<RetrievalMethod, RawEvaluation>();
    const thresholds = [];
    for (const method of resolved.methods) {
      const development = await evaluateRaw(index, developmentCases, method, retrievalOptions);
      developmentRaw.set(method, development);
      thresholds.push(calibrateAbstention(method, developmentCases, development.results));
    }
    const targetSplits: Split[] =
      resolved.split === "all" ? ["development", "test"] : [resolved.split];
    for (const method of resolved.methods) {
      if (targetSplits.includes("test")) {
        testRaw.set(method, await evaluateRaw(index, testCases, method, retrievalOptions));
      }
    }

    const methodRuns: MethodRun[] = [];
    const fingerprintInputs = new Map<
      string,
      ReadonlyMap<string, ReturnType<typeof resultForCase>>
    >();
    for (const split of targetSplits) {
      const splitCases = split === "development" ? developmentCases : testCases;
      for (const method of resolved.methods) {
        const raw = split === "development" ? developmentRaw.get(method)! : testRaw.get(method)!;
        const threshold = thresholds.find((item) => item.method === method)!;
        const finalResults = new Map(
          splitCases.map((retrievalCase) => [
            retrievalCase.id,
            resultForCase(raw.results.get(retrievalCase.id)!, retrievalCase, threshold.threshold),
          ]),
        );
        const summary = summarizeMetrics(splitCases, finalResults, index.solutions);
        const category = categoryMetrics(splitCases, finalResults, index.solutions);
        const latency = raw.latencyMs.slice(1);
        const methodRun: MethodRun = {
          method,
          split,
          candidatePoolSize: index.solutions.length,
          latency: {
            coldStartMs: raw.latencyMs[0] ?? 0,
            warmMedianMs: median(latency),
            warmP95Ms: percentile(latency, 0.95),
          },
          model: modelIdentity(resolved, reranker),
          calibration: threshold,
          metrics: summary.metrics,
          categoryMetrics: category,
          queries: [...finalResults.values()],
        };
        methodRuns.push(methodRun);
        fingerprintInputs.set(`${split}:${method}`, finalResults);
      }
    }

    const warnings: string[] = [];
    if (resolved.embeddingMode === "deterministic") {
      warnings.push(
        "Embedding retrieval uses the deterministic offline hash adapter through the existing LocalBackend/vector path; pass --embedding-mode local with a cached GGUF model for the production BGE embedder comparison.",
      );
    }
    if (resolved.rerankerMode === "fixture") {
      warnings.push(
        "Reranker retrieval uses committed cached fixtures and a deterministic fallback for unmatched pairs; pass --reranker-mode transformers to run the pinned Transformers.js model.",
      );
    }
    const categoryCounts = Object.fromEntries(
      CASE_CATEGORIES.map((category) => [
        category,
        benchmarkDataset.cases.filter((retrievalCase) => retrievalCase.category === category)
          .length,
      ]),
    ) as BenchmarkRun["dataset"]["casesPerCategory"];
    const result: BenchmarkRun = {
      benchmark: "ClankerOverflow Memory Retrieval Benchmark",
      version: 1,
      split: resolved.split,
      dataset: {
        families: benchmarkDataset.families.length,
        solutions: benchmarkDataset.solutions.length,
        cases: benchmarkDataset.cases.length,
        developmentCases: developmentCases.length,
        testCases: testCases.length,
        casesPerCategory: categoryCounts,
        repeatabilityFingerprint: repeatabilityFingerprint(fingerprintInputs),
      },
      thresholds,
      methods: methodRuns,
      warnings,
      artifacts: {},
    };

    if (resolved.writeFixtures) {
      mkdirSync(dirname(resolve(resolved.writeFixtures)), { recursive: true });
      writeFileSync(
        resolve(resolved.writeFixtures),
        `${JSON.stringify(benchmarkDataset, null, 2)}\n`,
        "utf8",
      );
    }
    mkdirSync(dirname(resolve(resolved.output)), { recursive: true });
    mkdirSync(dirname(resolve(resolved.report)), { recursive: true });
    result.artifacts = {
      jsonPath: resolve(resolved.output),
      markdownPath: resolve(resolved.report),
    };
    writeFileSync(resolve(resolved.output), `${JSON.stringify(result)}\n`, "utf8");
    writeFileSync(resolve(resolved.report), formatReport(result), "utf8");
    return result;
  } finally {
    index.close();
  }
}

function printUsage() {
  console.log(`Usage: pnpm eval:memory-retrieval [options]

Options:
  --split development|test|all       Report split (default: test; dev always calibrates thresholds)
  --methods keyword,embedding,...    Methods to compare (default: all five)
  --output <path>                    Raw JSON result path
  --report <path>                    Markdown report path
  --offline                          Disable remote model loading for Transformers.js
  --model-cache <path>               Shared model/cache directory
  --embedding-mode deterministic|local  Offline hash adapter or existing local GGUF embedder
  --embedding-model <path>           Cached GGUF path for --embedding-mode local
  --reranker-mode fixture|transformers  Cached fixtures or pinned Transformers.js model
  --reranker-fixtures <path>         Cached reranker fixture JSON
  --write-fixtures <path>            Write the validated dataset snapshot
`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    printUsage();
  } else {
    const result = await runMemoryRetrievalBenchmark(parseOptions(args));
    console.log(formatReport(result));
  }
}
