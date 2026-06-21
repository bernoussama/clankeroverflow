import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { totalmem, cpus, hostname, platform, release, tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { searchLocalKeyword, searchLocalKeywordExact } from "../../src/mcp/local-backend";
import { openLocalDb } from "../../src/mcp/local-db";
import { benchmarkCorpus } from "./corpus";
import { percentile, summarizeMetrics, type MetricSummary } from "./metrics";
import { BENCHMARK_MODELS, ensureModel } from "./models";
import type {
  BackendKey,
  ColdWorkerResult,
  FullWorkerResult,
  ModelKey,
  ProfileKey,
  Ranking,
} from "./types";

type Options = {
  models: ModelKey[];
  backends: BackendKey[];
  repetitions: number;
  coldRepetitions: number;
  quality: boolean;
  performance: boolean;
  output: string;
  cacheDir: string;
};

type QualityRow = {
  configuration: string;
  model: ModelKey | "keyword";
  profile: ProfileKey | "none";
  mode: "keyword" | "semantic" | "hybrid";
  scope: string;
  queries: number;
  metrics: MetricSummary;
};

type PerformanceRow = {
  model: ModelKey;
  backend: BackendKey;
  resolvedBackend: string;
  dimensions: number;
  contextSize: number;
  gpuLayers: number;
  artifactBytes: number;
  coldLoadP50Ms: number;
  coldLoadP95Ms: number;
  firstQueryP50Ms: number;
  firstQueryP95Ms: number;
  indexDocumentsPerSecond: number;
  indexTokensPerSecond: number;
  warmQueryP50Ms: number;
  warmQueryP95Ms: number;
  peakRssBytes: number;
};

function optionValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function parseList<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string,
) {
  if (!value) return [...allowed];
  const parsed = value.split(",").map((entry) => entry.trim()) as T[];
  for (const entry of parsed) {
    if (!allowed.includes(entry)) throw new Error(`Unknown ${label}: ${entry}`);
  }
  return [...new Set(parsed)];
}

function positiveInteger(value: string | undefined, fallback: number, label: string) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function parseOptions(args: string[]): Options {
  const qualityOnly = args.includes("--quality-only");
  const performanceOnly = args.includes("--performance-only");
  if (qualityOnly && performanceOnly)
    throw new Error("Choose only one of --quality-only or --performance-only");
  const defaultOutput = join(
    process.cwd(),
    "packages/cli/benchmarks/local-embeddings/results",
    `${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
  return {
    models: parseList(optionValue(args, "--models"), ["qwen", "nomic", "bge", "granite"], "model"),
    backends: parseList(optionValue(args, "--backend"), ["cpu", "auto"], "backend"),
    repetitions: positiveInteger(optionValue(args, "--repetitions"), 3, "--repetitions"),
    coldRepetitions: positiveInteger(
      optionValue(args, "--cold-repetitions"),
      5,
      "--cold-repetitions",
    ),
    quality: !performanceOnly,
    performance: !qualityOnly,
    output: resolve(optionValue(args, "--output") ?? defaultOutput),
    cacheDir: resolve(
      process.env.CLANKER_BENCHMARK_MODEL_CACHE ??
        join(process.cwd(), ".cache/clankeroverflow-embedding-benchmark/models"),
    ),
  };
}

async function runWorker<T>(input: Record<string, unknown>): Promise<T> {
  const workerPath = join(dirname(fileURLToPath(import.meta.url)), "worker.ts");
  const child = spawn(process.execPath, [...process.execArgv, workerPath], {
    cwd: process.cwd(),
    env: { ...process.env, CLANKER_BENCHMARK_WORKER_INPUT: JSON.stringify(input) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0)
    throw new Error(`Benchmark worker failed (${exitCode})\n${stderr}\n${stdout}`);
  const marker = stdout.split("\n").find((line) => line.startsWith("CLANKER_BENCHMARK_RESULT="));
  if (!marker) throw new Error(`Benchmark worker returned no result\n${stderr}\n${stdout}`);
  return JSON.parse(marker.slice("CLANKER_BENCHMARK_RESULT=".length)) as T;
}

function keywordRankings(strategy: "exact" | "tiered"): Ranking[] {
  const directory = mkdtempSync(join(tmpdir(), "clanker-keyword-benchmark-"));
  const db = openLocalDb(join(directory, "keyword.sqlite"));
  const insert = db.transaction(() => {
    for (const document of benchmarkCorpus.documents) {
      const info = db
        .prepare(
          `INSERT INTO solution (id, problem, solution, tags, score, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(
          document.id,
          document.problem,
          document.solution,
          document.tags,
          "2026-06-21",
          "2026-06-21",
        );
      db.prepare(
        "INSERT INTO solution_fts (rowid, problem, solution, tags) VALUES (?, ?, ?, ?)",
      ).run(info.lastInsertRowid, document.problem, document.solution, document.tags);
    }
  });
  insert.immediate();
  const rankings = benchmarkCorpus.queries.map((query) => ({
    queryId: query.id,
    semantic: [],
    hybrid: (strategy === "exact" ? searchLocalKeywordExact : searchLocalKeyword)(
      db,
      query.text,
      10,
    ).map((result) => result.id),
  }));
  db.close();
  rmSync(directory, { recursive: true, force: true });
  return rankings;
}

function qualityScopes() {
  return [
    { name: "overall", queries: benchmarkCorpus.queries },
    ...["literal", "paraphrase", "solution-intent", "hard-negative", "cross-language"].map(
      (category) => ({
        name: `category:${category}`,
        queries: benchmarkCorpus.queries.filter((query) => query.category === category),
      }),
    ),
    ...["en", "fr", "ar"].map((language) => ({
      name: `language:${language}`,
      queries: benchmarkCorpus.queries.filter((query) => query.language === language),
    })),
    ...["exact", "relaxed", "semantic"].map((expectedRetrieval) => ({
      name: `expected:${expectedRetrieval}`,
      queries: benchmarkCorpus.queries.filter(
        (query) => query.expectedRetrieval === expectedRetrieval,
      ),
    })),
  ];
}

function qualityRows(
  configuration: string,
  model: ModelKey | "keyword",
  profile: ProfileKey | "none",
  rankings: Ranking[],
  modes: Array<"keyword" | "semantic" | "hybrid">,
): QualityRow[] {
  return modes.flatMap((mode) => {
    const rankingMap = new Map(
      rankings.map((ranking) => [
        ranking.queryId,
        mode === "semantic" ? ranking.semantic : ranking.hybrid,
      ]),
    );
    return qualityScopes().map((scope) => ({
      configuration,
      model,
      profile,
      mode,
      scope: scope.name,
      queries: scope.queries.length,
      metrics: summarizeMetrics(scope.queries, rankingMap),
    }));
  });
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
}

function performanceRow(full: FullWorkerResult, cold: ColdWorkerResult[]): PerformanceRow {
  const indexDocumentsPerSecond = average(
    full.indexRuns.map((run) => run.documents / (run.elapsedMs / 1000)),
  );
  const indexTokensPerSecond = average(
    full.indexRuns.map((run) => run.tokens / (run.elapsedMs / 1000)),
  );
  return {
    model: full.model,
    backend: full.backend,
    resolvedBackend: full.resolvedBackend,
    dimensions: full.dimensions,
    contextSize: full.contextSize,
    gpuLayers: full.gpuLayers,
    artifactBytes: BENCHMARK_MODELS[full.model].size,
    coldLoadP50Ms: percentile(
      cold.map((run) => run.loadMs),
      0.5,
    ),
    coldLoadP95Ms: percentile(
      cold.map((run) => run.loadMs),
      0.95,
    ),
    firstQueryP50Ms: percentile(
      cold.map((run) => run.firstQueryMs),
      0.5,
    ),
    firstQueryP95Ms: percentile(
      cold.map((run) => run.firstQueryMs),
      0.95,
    ),
    indexDocumentsPerSecond,
    indexTokensPerSecond,
    warmQueryP50Ms: percentile(full.queryLatenciesMs, 0.5),
    warmQueryP95Ms: percentile(full.queryLatenciesMs, 0.95),
    peakRssBytes: Math.max(full.peakRssBytes, ...cold.map((run) => run.peakRssBytes)),
  };
}

function fixed(value: number, digits = 3) {
  return value.toFixed(digits);
}

function metricCell(summary: MetricSummary, name: keyof MetricSummary) {
  const metric = summary[name];
  return `${fixed(metric.value)} [${fixed(metric.low)}, ${fixed(metric.high)}]`;
}

function markdownReport(report: any) {
  const overall = (report.quality as QualityRow[]).filter((row) => row.scope === "overall");
  const promptDeltas = (["qwen", "nomic"] as ModelKey[]).flatMap((model) => {
    const native = overall.find(
      (row) => row.model === model && row.profile === "native" && row.mode === "semantic",
    );
    const raw = overall.find(
      (row) => row.model === model && row.profile === "raw" && row.mode === "semantic",
    );
    return native && raw ? [{ model, native, raw }] : [];
  });
  const lines = [
    "# Local Embedding Benchmark",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Environment",
    "",
    `- Host: ${report.environment.hostname}`,
    `- Platform: ${report.environment.platform} ${report.environment.release}`,
    `- CPU: ${report.environment.cpuModel} (${report.environment.logicalCpus} logical CPUs)`,
    `- Memory: ${(report.environment.totalMemoryBytes / 1024 ** 3).toFixed(1)} GiB`,
    `- Node: ${report.environment.node}`,
    `- node-llama-cpp: ${report.environment.nodeLlamaCpp}`,
    "",
  ];
  if (overall.length) {
    lines.push(
      "## Overall Quality",
      "",
      "| Configuration | Mode | nDCG@10 (95% CI) | MRR@10 (95% CI) | Recall@1 | Recall@10 |",
      "| --- | --- | ---: | ---: | ---: | ---: |",
      ...overall.map(
        (row) =>
          `| ${row.configuration} | ${row.mode} | ${metricCell(row.metrics, "ndcg10")} | ${metricCell(row.metrics, "mrr10")} | ${fixed(row.metrics.recall1.value)} | ${fixed(row.metrics.recall10.value)} |`,
      ),
      "",
    );
    if (promptDeltas.length) {
      lines.push(
        "## Prompt Ablation",
        "",
        "Positive values show the improvement from model-native prompting over raw text.",
        "",
        "| Model | nDCG@10 delta | MRR@10 delta | Recall@1 delta |",
        "| --- | ---: | ---: | ---: |",
        ...promptDeltas.map(
          ({ model, native, raw }) =>
            `| ${BENCHMARK_MODELS[model].label} | ${fixed(native.metrics.ndcg10.value - raw.metrics.ndcg10.value)} | ${fixed(native.metrics.mrr10.value - raw.metrics.mrr10.value)} | ${fixed(native.metrics.recall1.value - raw.metrics.recall1.value)} |`,
        ),
        "",
      );
    }
    lines.push(
      "## Quality by Slice",
      "",
      "| Configuration | Mode | Slice | Queries | nDCG@10 | MRR@10 |",
      "| --- | --- | --- | ---: | ---: | ---: |",
      ...(report.quality as QualityRow[])
        .filter((row) => row.scope !== "overall")
        .map(
          (row) =>
            `| ${row.configuration} | ${row.mode} | ${row.scope} | ${row.queries} | ${fixed(row.metrics.ndcg10.value)} | ${fixed(row.metrics.mrr10.value)} |`,
        ),
      "",
    );
  }
  if (report.performance.length) {
    lines.push(
      "## Performance",
      "",
      "| Model | Lane | Resolved | Size MiB | Load p50 ms | First query p50 ms | Docs/s | Tokens/s | Warm query p50/p95 ms | Peak RSS MiB |",
      "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...(report.performance as PerformanceRow[]).map(
        (row) =>
          `| ${BENCHMARK_MODELS[row.model].label} | ${row.backend} | ${row.resolvedBackend} | ${fixed(row.artifactBytes / 1024 ** 2, 1)} | ${fixed(row.coldLoadP50Ms, 1)} | ${fixed(row.firstQueryP50Ms, 1)} | ${fixed(row.indexDocumentsPerSecond, 1)} | ${fixed(row.indexTokensPerSecond, 1)} | ${fixed(row.warmQueryP50Ms, 1)} / ${fixed(row.warmQueryP95Ms, 1)} | ${fixed(row.peakRssBytes / 1024 ** 2, 1)} |`,
      ),
      "",
    );
  }
  lines.push(
    "## Method",
    "",
    "Quality uses 200 English solution documents and 100 judged queries: 80 English, 10 French-to-English, and 10 Arabic-to-English. Relevance grades are 3 for the decisive entry and 1 for a related hard negative. Semantic and hybrid retrieval use the production cosine sqlite-vec and weighted RRF paths.",
    "",
    "Performance uses model-native prompting, process-cold/filesystem-warm load workers, and isolated temporary SQLite databases. Raw prompt variants are quality-only. This report characterizes candidates and does not change or recommend a shipped default.",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const reportFrom = optionValue(args, "--report-from");
  if (reportFrom) {
    const report = JSON.parse(readFileSync(resolve(reportFrom), "utf8"));
    const output = resolve(optionValue(args, "--output") ?? reportFrom);
    const jsonPath = extname(output) === ".json" ? output : `${output}.json`;
    const markdownPath = jsonPath.replace(/\.json$/, ".md");
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(markdownPath, markdownReport(report));
    console.log(`[benchmark] JSON: ${jsonPath}`);
    console.log(`[benchmark] report: ${markdownPath}`);
    return;
  }
  const options = parseOptions(args);
  mkdirSync(options.cacheDir, { recursive: true });
  const modelPaths = new Map<ModelKey, string>();
  for (const key of options.models) {
    console.log(`[benchmark] checking ${BENCHMARK_MODELS[key].label}`);
    modelPaths.set(key, await ensureModel(BENCHMARK_MODELS[key], options.cacheDir));
  }

  const quality: QualityRow[] = [];
  const performance: PerformanceRow[] = [];
  if (options.quality) {
    quality.push(
      ...qualityRows("Keyword FTS5 exact", "keyword", "none", keywordRankings("exact"), [
        "keyword",
      ]),
      ...qualityRows("Keyword FTS5 tiered", "keyword", "none", keywordRankings("tiered"), [
        "keyword",
      ]),
    );
  }

  const qualityBackend = options.backends.includes("auto") ? "auto" : options.backends[0]!;
  for (const model of options.models) {
    for (const backend of options.backends) {
      if (!options.performance && backend !== qualityBackend) continue;
      console.log(`[benchmark] ${model} native on ${backend}`);
      const full = await runWorker<FullWorkerResult>({
        phase: "full",
        model,
        modelPath: modelPaths.get(model),
        profile: "native",
        backend,
        repetitions: options.performance ? options.repetitions : 1,
        includeRankings: options.quality && backend === qualityBackend,
      });
      if (options.quality && backend === qualityBackend && full.rankings) {
        quality.push(
          ...qualityRows(
            `${BENCHMARK_MODELS[model].label} native`,
            model,
            "native",
            full.rankings,
            ["semantic", "hybrid"],
          ),
        );
      }
      if (options.performance) {
        const cold: ColdWorkerResult[] = [];
        for (let repetition = 0; repetition < options.coldRepetitions; repetition += 1) {
          console.log(
            `[benchmark] ${model} ${backend} cold ${repetition + 1}/${options.coldRepetitions}`,
          );
          cold.push(
            await runWorker<ColdWorkerResult>({
              phase: "cold",
              model,
              modelPath: modelPaths.get(model),
              profile: "native",
              backend,
              repetitions: 1,
              includeRankings: false,
            }),
          );
        }
        performance.push(performanceRow(full, cold));
      }
    }

    if (options.quality && model !== "bge" && model !== "granite") {
      console.log(`[benchmark] ${model} raw prompt ablation on ${qualityBackend}`);
      const raw = await runWorker<FullWorkerResult>({
        phase: "full",
        model,
        modelPath: modelPaths.get(model),
        profile: "raw",
        backend: qualityBackend,
        repetitions: 1,
        includeRankings: true,
      });
      quality.push(
        ...qualityRows(`${BENCHMARK_MODELS[model].label} raw`, model, "raw", raw.rankings ?? [], [
          "semantic",
          "hybrid",
        ]),
      );
    }
  }

  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), "packages/cli/package.json"), "utf8"),
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    options,
    corpus: {
      version: benchmarkCorpus.version,
      documents: benchmarkCorpus.documents.length,
      queries: benchmarkCorpus.queries.length,
      labelReview: "single-reviewer",
    },
    environment: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      cpuModel: cpus()[0]?.model ?? "unknown",
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      node: process.version,
      pnpm: process.env.npm_config_user_agent ?? "unknown",
      nodeLlamaCpp: packageJson.optionalDependencies["node-llama-cpp"],
    },
    models: Object.fromEntries(options.models.map((key) => [key, BENCHMARK_MODELS[key]])),
    quality,
    performance,
  };
  const jsonPath = extname(options.output) === ".json" ? options.output : `${options.output}.json`;
  const markdownPath = jsonPath.replace(/\.json$/, ".md");
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, markdownReport(report));
  console.log(`[benchmark] JSON: ${jsonPath}`);
  console.log(`[benchmark] report: ${markdownPath}`);
}

await main();
