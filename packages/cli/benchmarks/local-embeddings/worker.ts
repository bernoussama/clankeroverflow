import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  reciprocalRankFusion,
  searchLocalKeywordRelaxed,
  searchLocalSemantic,
} from "../../src/mcp/local-backend";
import { openLocalDb, type LocalDb } from "../../src/mcp/local-db";
import { embedTextWithTokenChunks, ensureVecTable } from "../../src/mcp/local-semantic";
import { benchmarkCorpus } from "./corpus";
import { BENCHMARK_MODELS } from "./models";
import { formatDocument, formatQuery } from "./profiles";
import type {
  BackendKey,
  ColdWorkerResult,
  FullWorkerResult,
  ModelKey,
  ProfileKey,
  Ranking,
} from "./types";

type WorkerInput = {
  phase: "cold" | "full";
  model: ModelKey;
  modelPath: string;
  profile: ProfileKey;
  backend: BackendKey;
  repetitions: number;
  includeRankings: boolean;
};

function peakRssBytes() {
  const maxRss = process.resourceUsage().maxRSS;
  return process.platform === "darwin" ? maxRss : maxRss * 1024;
}

function shuffled<T>(values: readonly T[], seed: number) {
  const copy = [...values];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

function insertDocuments(db: LocalDb) {
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
          "2026-06-21T00:00:00.000Z",
          "2026-06-21T00:00:00.000Z",
        );
      db.prepare(
        "INSERT INTO solution_fts (rowid, problem, solution, tags) VALUES (?, ?, ?, ?)",
      ).run(info.lastInsertRowid, document.problem, document.solution, document.tags);
    }
  });
  insert.immediate();
}

async function loadEmbedder(input: WorkerInput) {
  const started = performance.now();
  const { getLlama, LlamaLogLevel } = await import("node-llama-cpp");
  const llama = await getLlama({
    gpu: input.backend === "cpu" ? false : "auto",
    logLevel: LlamaLogLevel.error,
    logger: () => {},
  });
  const model = await llama.loadModel({ modelPath: input.modelPath });
  const context = await model.createEmbeddingContext({ contextSize: model.trainContextSize });
  const loadMs = performance.now() - started;
  const dimensions = BENCHMARK_MODELS[input.model].dimensions;
  return {
    llama,
    model,
    context,
    loadMs,
    async embed(text: string) {
      return embedTextWithTokenChunks(
        model,
        context as unknown as Parameters<typeof embedTextWithTokenChunks>[1],
        text,
        dimensions,
      );
    },
  };
}

async function runCold(input: WorkerInput): Promise<ColdWorkerResult> {
  const loaded = await loadEmbedder(input);
  try {
    const query = formatQuery(input.model, "native", benchmarkCorpus.queries[0]!.text);
    const started = performance.now();
    await loaded.embed(query);
    const firstQueryMs = performance.now() - started;
    return {
      model: input.model,
      backend: input.backend,
      resolvedBackend: String(loaded.llama.gpu),
      loadMs: loaded.loadMs,
      firstQueryMs,
      peakRssBytes: peakRssBytes(),
    };
  } finally {
    await loaded.context.dispose();
    await loaded.model.dispose();
    await loaded.llama.dispose();
  }
}

async function createIndexedDb(
  input: WorkerInput,
  loaded: Awaited<ReturnType<typeof loadEmbedder>>,
) {
  const directory = mkdtempSync(join(tmpdir(), "clanker-embedding-benchmark-"));
  const db = openLocalDb(join(directory, "benchmark.sqlite"));
  await ensureVecTable(db, BENCHMARK_MODELS[input.model].dimensions);
  insertDocuments(db);
  let tokens = 0;
  const started = performance.now();
  for (const document of benchmarkCorpus.documents) {
    const text = formatDocument(input.model, input.profile, document);
    tokens += loaded.model.tokenize(text, false, "trimLeadingSpace").length;
    const embedding = await loaded.embed(text);
    db.prepare("INSERT INTO solution_vec(solution_id, embedding) VALUES (?, ?)").run(
      document.id,
      embedding,
    );
  }
  return {
    db,
    directory,
    elapsedMs: performance.now() - started,
    tokens,
  };
}

async function runFull(input: WorkerInput): Promise<FullWorkerResult> {
  const loaded = await loadEmbedder(input);
  let retained: Awaited<ReturnType<typeof createIndexedDb>> | undefined;
  try {
    const indexRuns: FullWorkerResult["indexRuns"] = [];
    for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
      const indexed = await createIndexedDb(input, loaded);
      indexRuns.push({
        elapsedMs: indexed.elapsedMs,
        tokens: indexed.tokens,
        documents: benchmarkCorpus.documents.length,
      });
      if (repetition === input.repetitions - 1) retained = indexed;
      else {
        indexed.db.close();
        rmSync(indexed.directory, { recursive: true, force: true });
      }
    }
    if (!retained) throw new Error("Benchmark did not create an index");

    const queryLatenciesMs: number[] = [];
    let rankings: Ranking[] | undefined;
    for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
      const orderedQueries = shuffled(benchmarkCorpus.queries, 20_260_621 + repetition);
      const currentRankings: Ranking[] = [];
      for (const query of orderedQueries) {
        const started = performance.now();
        const embedding = await loaded.embed(formatQuery(input.model, input.profile, query.text));
        const semantic = searchLocalSemantic(retained.db, embedding, 20);
        queryLatenciesMs.push(performance.now() - started);
        if (input.includeRankings && repetition === 0) {
          const keyword = searchLocalKeywordRelaxed(retained.db, query.text, 20);
          const hybrid = reciprocalRankFusion(
            [
              { weight: 1.25, results: keyword },
              { weight: 1, results: semantic },
            ],
            10,
          );
          currentRankings.push({
            queryId: query.id,
            semantic: semantic.slice(0, 10).map((result) => result.id),
            hybrid: hybrid.map((result) => result.id),
          });
        }
      }
      if (input.includeRankings && repetition === 0) rankings = currentRankings;
    }

    return {
      model: input.model,
      profile: input.profile,
      backend: input.backend,
      resolvedBackend: String(loaded.llama.gpu),
      dimensions: BENCHMARK_MODELS[input.model].dimensions,
      contextSize: loaded.model.trainContextSize,
      gpuLayers: loaded.model.gpuLayers,
      loadMs: loaded.loadMs,
      indexRuns,
      queryLatenciesMs,
      rankings,
      peakRssBytes: peakRssBytes(),
    };
  } finally {
    if (retained) {
      retained.db.close();
      rmSync(retained.directory, { recursive: true, force: true });
    }
    await loaded.context.dispose();
    await loaded.model.dispose();
    await loaded.llama.dispose();
  }
}

const input = JSON.parse(
  process.env.CLANKER_BENCHMARK_WORKER_INPUT ?? "null",
) as WorkerInput | null;
if (!input) throw new Error("CLANKER_BENCHMARK_WORKER_INPUT is required");
const result = input.phase === "cold" ? await runCold(input) : await runFull(input);
process.stdout.write(`CLANKER_BENCHMARK_RESULT=${JSON.stringify(result)}\n`);
