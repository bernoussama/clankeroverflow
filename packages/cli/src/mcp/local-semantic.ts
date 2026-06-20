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
export const LOCAL_EMBEDDER_ID = "sqlite-lembed";
export const LOCAL_EMBEDDING_FORMAT_VERSION = "solution-v1";
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
const lembedLoaded = new WeakSet<LocalDb>();

export function defaultLocalModelPath(env: NodeJS.ProcessEnv = process.env) {
  const cacheRoot = env.XDG_CACHE_HOME || join(homedir(), ".cache");
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

export function queryEmbeddingText(query: string) {
  return query.trim();
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

async function loadLembed(db: LocalDb) {
  if (lembedLoaded.has(db)) return;
  try {
    const sqliteLembed = await import("sqlite-lembed");
    sqliteLembed.load(db);
    lembedLoaded.add(db);
  } catch (error) {
    throw new Error(
      `sqlite-lembed extension is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function ensureTempModelTable(db: LocalDb, config: LocalSemanticConfig) {
  const modelValidation = validateGgufFile(config.modelPath);
  if (!modelValidation.ok) {
    throw new Error(modelValidation.error ?? "model file is not valid");
  }
  db.prepare(
    `INSERT OR REPLACE INTO temp.lembed_models(name, model)
     SELECT ?, lembed_model_from_file(?)`,
  ).run(config.modelId, config.modelPath);
}

export async function createSqliteEmbedder(db: LocalDb, config: LocalSemanticConfig) {
  await loadLembed(db);
  ensureTempModelTable(db, config);
  return {
    embed(text: string) {
      const row = db.prepare("SELECT lembed(?, ?) AS embedding").get(config.modelId, text) as
        | { embedding: Buffer | Uint8Array }
        | undefined;
      if (!row?.embedding) throw new Error("sqlite-lembed returned no embedding");
      return Buffer.from(row.embedding);
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
  options: { limit?: number; fingerprint?: string } = {},
) {
  ensureLocalSemanticSchema(db);
  const fingerprint = options.fingerprint ?? statusEmbeddingFingerprint(config);
  const hasVecTable = hasSolutionVecTable(db);
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
  const pendingSolutions = getSolutionsNeedingEmbedding(db, config, { fingerprint });
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
  const hasVecTable = hasSolutionVecTable(db);

  let sqliteVecAvailable = true;
  let sqliteVecError: string | undefined;
  try {
    await loadSqliteVec(db);
  } catch (error) {
    sqliteVecAvailable = false;
    sqliteVecError = error instanceof Error ? error.message : String(error);
  }

  let embedderAvailable = true;
  let embedderError: string | undefined;
  try {
    await loadLembed(db);
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
