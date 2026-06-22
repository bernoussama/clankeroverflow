import { createHash } from "node:crypto";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { LocalDb } from "./local-db";

export const DEFAULT_LOCAL_MODEL_ID = "bge-small-en-v1.5-q8_0";
export const DEFAULT_LOCAL_MODEL_FILE = "bge-small-en-v1.5-q8_0.gguf";
export const DEFAULT_LOCAL_MODEL_DIMENSIONS = 384;
export const DEFAULT_LOCAL_MODEL_URL =
  "https://huggingface.co/ggml-org/bge-small-en-v1.5-Q8_0-GGUF/resolve/main/bge-small-en-v1.5-q8_0.gguf";
export const LOCAL_EMBEDDER_ID = "node-llama-cpp";
export const LOCAL_EMBEDDING_FORMAT_VERSION = "solution-v2";
export const LOCAL_QUERY_FORMAT_VERSION = "query-v1";

export type LocalSemanticConfig = {
  enabled: boolean;
  modelId: string;
  modelPath: string;
  dimensions: number;
};

export type LocalSemanticStatus = {
  enabled: boolean;
  modelId: string;
  modelPath: string;
  dimensions: number;
  fingerprint: string;
  totalSolutions: number;
  embeddedSolutions: number;
  pendingEmbeddings: number;
  staleEmbeddings: number;
  hasVecTable: boolean;
  sqliteVecAvailable: boolean;
  sqliteVecError?: string;
  embedderAvailable: boolean;
  embedderError?: string;
  modelExists: boolean;
  modelValid: boolean;
  modelError?: string;
};

const sqliteVecLoaded = new WeakSet<LocalDb>();

type EmbeddingVector = {
  vector: readonly number[];
};

type EmbeddingContext = {
  getEmbeddingFor(input: number[] | string): Promise<EmbeddingVector>;
};

type EmbeddingModel = {
  trainContextSize: number;
  tokenize(text: string, specialTokens?: boolean, options?: "trimLeadingSpace"): number[];
};

export function defaultLocalModelPath(env: NodeJS.ProcessEnv = process.env) {
  const cacheRoot = env.XDG_CACHE_HOME || join(env.HOME || homedir(), ".cache");
  return join(cacheRoot, "clankeroverflow", "models", DEFAULT_LOCAL_MODEL_FILE);
}

export function solutionEmbeddingText(input: {
  problem: string;
  solution: string;
  tags: string | null | undefined;
}) {
  const tags = input.tags?.trim();
  const header = tags ? `Tags: ${tags}\n\n` : "";
  return `${header}Problem:\n${input.problem.trim()}\n\nSolution:\n${input.solution.trim()}`;
}

/**
 * bge-small-en-v1.5 is an asymmetric retriever: queries must be prefixed with
 * the retrieval instruction while documents/passages must not. Applying this
 * prefix to the query (only) aligns query embeddings with the indexed solution
 * embeddings; document-side text is left untouched, so no re-embedding needed.
 * See https://huggingface.co/BAAI/bge-small-en-v1.5
 */
const LOCAL_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages:";

export function queryEmbeddingText(query: string) {
  return `${LOCAL_QUERY_INSTRUCTION} ${query.trim()}`;
}

function sha256(text: string | Buffer) {
  return createHash("sha256").update(text).digest("hex");
}

export function solutionContentHash(input: {
  problem: string;
  solution: string;
  tags: string | null | undefined;
}) {
  return sha256(solutionEmbeddingText(input));
}

export function modelFileHash(modelPath: string) {
  return sha256(readFileSync(modelPath));
}

export function embeddingFingerprint(
  config: Pick<LocalSemanticConfig, "modelId" | "dimensions">,
  modelIdentity: string,
) {
  return sha256(
    JSON.stringify({
      model: config.modelId,
      modelIdentity,
      embedder: LOCAL_EMBEDDER_ID,
      dimensions: config.dimensions,
      documentFormat: LOCAL_EMBEDDING_FORMAT_VERSION,
      queryFormat: LOCAL_QUERY_FORMAT_VERSION,
    }),
  ).slice(0, 16);
}

export function embeddingFingerprintForConfig(config: LocalSemanticConfig) {
  const validation = validateGgufFile(config.modelPath);
  if (!validation.ok) {
    throw new Error(validation.error ?? "model file is not valid");
  }
  return embeddingFingerprint(config, modelFileHash(config.modelPath));
}

function statusEmbeddingFingerprint(config: LocalSemanticConfig) {
  if (!existsSync(config.modelPath)) {
    return embeddingFingerprint(config, `missing:${resolve(config.modelPath)}`);
  }
  return embeddingFingerprint(config, modelFileHash(config.modelPath));
}

export function validateGgufFile(modelPath: string) {
  if (!existsSync(modelPath)) return { ok: false, error: "model file does not exist" };
  const header = Buffer.alloc(16);
  const fd = openSync(modelPath, "r");
  try {
    readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }
  const magic = header.subarray(0, 4).toString("utf8");
  if (magic === "GGUF") return { ok: true };
  const start = header.toString("utf8").toLowerCase();
  if (start.includes("<!do") || start.includes("<htm")) {
    return { ok: false, error: "model path contains HTML, not a GGUF model" };
  }
  return { ok: false, error: "model file is not a GGUF file" };
}

export async function downloadDefaultLocalModel(
  modelPath: string,
  fetchImpl: typeof fetch = fetch,
) {
  const validation = validateGgufFile(modelPath);
  if (validation.ok) return { downloaded: false, modelPath };

  mkdirSync(dirname(modelPath), { recursive: true });
  const tmpPath = `${modelPath}.tmp-${process.pid}`;
  rmSync(tmpPath, { force: true });
  const response = await fetchImpl(DEFAULT_LOCAL_MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download local embedding model (${response.status})`);
  }
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(tmpPath));
  const tmpValidation = validateGgufFile(tmpPath);
  if (!tmpValidation.ok) {
    rmSync(tmpPath, { force: true });
    throw new Error(tmpValidation.error ?? "Downloaded model is not a valid GGUF file");
  }
  renameSync(tmpPath, modelPath);
  return { downloaded: true, modelPath };
}

export async function loadSqliteVec(db: LocalDb) {
  if (sqliteVecLoaded.has(db)) return;
  try {
    const sqliteVec = await import("sqlite-vec");
    sqliteVec.load(db);
    sqliteVecLoaded.add(db);
  } catch (error) {
    throw new Error(
      `sqlite-vec extension is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function checkLocalEmbedderAvailable() {
  try {
    await import("node-llama-cpp");
  } catch (error) {
    throw new Error(
      `node-llama-cpp embedder is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function floatVectorToBuffer(vector: ArrayLike<number>, dimensions: number) {
  if (vector.length !== dimensions) {
    throw new Error(
      `node-llama-cpp returned ${vector.length} embedding dimensions, but CLANKER_LOCAL_MODEL_DIMENSIONS is ${dimensions}`,
    );
  }
  const buffer = Buffer.allocUnsafe(dimensions * Float32Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < dimensions; index += 1) {
    buffer.writeFloatLE(vector[index]!, index * Float32Array.BYTES_PER_ELEMENT);
  }
  return buffer;
}

export function maxEmbeddingChunkTokens(trainContextSize: number) {
  const contextSize = Number.isFinite(trainContextSize) ? Math.floor(trainContextSize) : 1;
  return Math.max(1, contextSize - 2);
}

export function chunkEmbeddingTokens(tokens: readonly number[], maxTokens: number) {
  const safeMax = Math.max(1, Math.floor(maxTokens));
  const chunks: number[][] = [];
  for (let index = 0; index < tokens.length; index += safeMax) {
    chunks.push(tokens.slice(index, index + safeMax));
  }
  return chunks;
}

export function weightedAverageEmbeddingVectors(
  vectors: Array<{ vector: ArrayLike<number>; weight: number }>,
  dimensions: number,
) {
  if (vectors.length === 0) {
    throw new Error("Cannot average zero local embedding vectors");
  }

  const averaged = Array.from({ length: dimensions }, () => 0);
  let totalWeight = 0;

  for (const item of vectors) {
    if (item.vector.length !== dimensions) {
      throw new Error(
        `node-llama-cpp returned ${item.vector.length} embedding dimensions, but CLANKER_LOCAL_MODEL_DIMENSIONS is ${dimensions}`,
      );
    }
    const weight = Math.max(1, item.weight);
    totalWeight += weight;
    for (let index = 0; index < dimensions; index += 1) {
      averaged[index]! += item.vector[index]! * weight;
    }
  }

  for (let index = 0; index < dimensions; index += 1) {
    averaged[index]! /= totalWeight;
  }

  const magnitude = Math.hypot(...averaged);
  if (magnitude === 0) return averaged;
  return averaged.map((value) => value / magnitude);
}

export async function embedTextWithTokenChunks(
  model: EmbeddingModel,
  context: EmbeddingContext,
  text: string,
  dimensions: number,
) {
  const tokens = model.tokenize(text, false, "trimLeadingSpace");
  const chunks = chunkEmbeddingTokens(tokens, maxEmbeddingChunkTokens(model.trainContextSize));

  if (chunks.length === 0) {
    const embedding = await context.getEmbeddingFor(text);
    return floatVectorToBuffer(embedding.vector, dimensions);
  }

  const embeddings = [];
  for (const chunk of chunks) {
    const embedding = await context.getEmbeddingFor(chunk);
    embeddings.push({ vector: embedding.vector, weight: chunk.length });
  }

  return floatVectorToBuffer(weightedAverageEmbeddingVectors(embeddings, dimensions), dimensions);
}

export async function createLocalEmbedder(config: LocalSemanticConfig) {
  const modelValidation = validateGgufFile(config.modelPath);
  if (!modelValidation.ok) {
    throw new Error(modelValidation.error ?? "model file is not valid");
  }
  const { getLlama } = await import("node-llama-cpp");
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath: config.modelPath });
  const context = await model.createEmbeddingContext({ contextSize: model.trainContextSize });
  return {
    async embed(text: string) {
      return embedTextWithTokenChunks(
        model,
        context as unknown as EmbeddingContext,
        text,
        config.dimensions,
      );
    },
  };
}

export function ensureLocalSemanticSchema(db: LocalDb) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS solution_embedding (
      solution_id TEXT PRIMARY KEY NOT NULL,
      model TEXT NOT NULL,
      embedder TEXT NOT NULL,
      embedding_fingerprint TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      embedded_at TEXT NOT NULL,
      FOREIGN KEY (solution_id) REFERENCES solution(id) ON DELETE CASCADE
    );
  `);
}

function hasSolutionVecTable(db: LocalDb) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'solution_vec'").get(),
  );
}

export async function ensureVecTable(db: LocalDb, dimensions: number) {
  await loadSqliteVec(db);
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'solution_vec'")
    .get() as { sql: string } | undefined;
  if (tableInfo) {
    const existing = tableInfo.sql.match(/float\[(\d+)\]/)?.[1];
    const hasCosine = tableInfo.sql.includes("distance_metric=cosine");
    if (existing && Number(existing) !== dimensions) {
      throw new Error(
        `Embedding dimension mismatch: existing vectors are ${existing}d but the current model uses ${dimensions}d. Run clanker local embed --force.`,
      );
    }
    if (existing && hasCosine) return;
    db.exec("DROP TABLE IF EXISTS solution_vec");
  }
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS solution_vec USING vec0(solution_id TEXT PRIMARY KEY, embedding float[${dimensions}] distance_metric=cosine)`,
  );
}

export function insertEmbedding(
  db: LocalDb,
  input: {
    solutionId: string;
    model: string;
    fingerprint: string;
    contentHash: string;
    dimensions: number;
    embedding: Buffer;
    embeddedAt: string;
  },
) {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO solution_embedding
       (solution_id, model, embedder, embedding_fingerprint, content_hash, dimensions, embedded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.solutionId,
      input.model,
      LOCAL_EMBEDDER_ID,
      input.fingerprint,
      input.contentHash,
      input.dimensions,
      input.embeddedAt,
    );
    db.prepare("DELETE FROM solution_vec WHERE solution_id = ?").run(input.solutionId);
    db.prepare("INSERT INTO solution_vec(solution_id, embedding) VALUES (?, ?)").run(
      input.solutionId,
      input.embedding,
    );
  });
  tx.immediate();
}

export function getSolutionsNeedingEmbedding(
  db: LocalDb,
  config: LocalSemanticConfig,
  options: { limit?: number; fingerprint?: string; includeVectorRows?: boolean } = {},
) {
  ensureLocalSemanticSchema(db);
  const fingerprint = options.fingerprint ?? statusEmbeddingFingerprint(config);
  const hasVecTable = options.includeVectorRows ?? hasSolutionVecTable(db);
  const rows = db
    .prepare(
      `SELECT solution.id, solution.problem, solution.solution, solution.tags,
              solution_embedding.model, solution_embedding.embedding_fingerprint,
              solution_embedding.content_hash, solution_embedding.dimensions,
              ${hasVecTable ? "solution_vec.solution_id" : "NULL"} AS vector_solution_id
       FROM solution
       LEFT JOIN solution_embedding ON solution_embedding.solution_id = solution.id
       ${hasVecTable ? "LEFT JOIN solution_vec ON solution_vec.solution_id = solution.id" : ""}
       ORDER BY solution.updated_at ASC`,
    )
    .all() as Array<{
    id: string;
    problem: string;
    solution: string;
    tags: string | null;
    model: string | null;
    embedding_fingerprint: string | null;
    content_hash: string | null;
    dimensions: number | null;
    vector_solution_id: string | null;
  }>;

  const pending = rows.filter((row) => {
    return (
      row.model !== config.modelId ||
      row.embedding_fingerprint !== fingerprint ||
      row.dimensions !== config.dimensions ||
      row.content_hash !== solutionContentHash(row) ||
      row.vector_solution_id !== row.id
    );
  });
  return typeof options.limit === "number" ? pending.slice(0, options.limit) : pending;
}

export async function getLocalSemanticStatus(db: LocalDb, config: LocalSemanticConfig) {
  ensureLocalSemanticSchema(db);
  const fingerprint = statusEmbeddingFingerprint(config);
  const totalSolutions = (
    db.prepare("SELECT COUNT(*) AS count FROM solution").get() as { count: number }
  ).count;
  const hasVecTable = hasSolutionVecTable(db);

  let sqliteVecAvailable = true;
  let sqliteVecError: string | undefined;
  try {
    await loadSqliteVec(db);
  } catch (error) {
    sqliteVecAvailable = false;
    sqliteVecError = error instanceof Error ? error.message : String(error);
  }

  const pendingSolutions = getSolutionsNeedingEmbedding(db, config, {
    fingerprint,
    includeVectorRows: hasVecTable && sqliteVecAvailable,
  });
  const embeddedSolutions = totalSolutions - pendingSolutions.length;
  const staleEmbeddings = (
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM solution_embedding
         WHERE model != ? OR embedding_fingerprint != ? OR dimensions != ?`,
      )
      .get(config.modelId, fingerprint, config.dimensions) as { count: number }
  ).count;

  let embedderAvailable = true;
  let embedderError: string | undefined;
  try {
    await checkLocalEmbedderAvailable();
  } catch (error) {
    embedderAvailable = false;
    embedderError = error instanceof Error ? error.message : String(error);
  }

  const modelValidation = validateGgufFile(config.modelPath);
  return {
    enabled: config.enabled,
    modelId: config.modelId,
    modelPath: resolve(config.modelPath),
    dimensions: config.dimensions,
    fingerprint,
    totalSolutions,
    embeddedSolutions,
    pendingEmbeddings: pendingSolutions.length,
    staleEmbeddings,
    hasVecTable,
    sqliteVecAvailable,
    sqliteVecError,
    embedderAvailable,
    embedderError,
    modelExists: existsSync(config.modelPath),
    modelValid: modelValidation.ok,
    modelError: modelValidation.error,
  } satisfies LocalSemanticStatus;
}
