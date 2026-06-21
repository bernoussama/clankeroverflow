import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

import { ftsQuery, FtsQuerySyntaxError, LocalBackend } from "./local-backend";
import { openLocalDb } from "./local-db";
import {
  embeddingFingerprintForConfig,
  floatVectorToBuffer,
  LOCAL_EMBEDDER_ID,
  type LocalSemanticConfig,
} from "./local-semantic";

function vector(values: number[]) {
  return floatVectorToBuffer(values, values.length);
}

function writeGguf(modelPath: string, contents: string) {
  writeFileSync(modelPath, Buffer.concat([Buffer.from("GGUF"), Buffer.from(contents)]));
}

describe("CLI local MCP backend", () => {
  let dir: string;
  let dbPath: string;
  let modelPath: string;
  let fetchMock: MockInstance<typeof global.fetch>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clanker-mcp-"));
    dbPath = join(dir, "solutions.sqlite");
    modelPath = join(dir, "model.gguf");
    writeGguf(modelPath, "test-model");
    fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () => {
      throw new Error("local mode must not call fetch");
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  test("initializes the expected schema", () => {
    const db = openLocalDb(dbPath);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual') ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(tables.map((row) => row.name)).toContain("solution");
    expect(tables.map((row) => row.name)).toContain("solution_vote");
    expect(tables.map((row) => row.name)).toContain("solution_fts");
    expect(tables.map((row) => row.name)).toContain("local_migration");

    db.close();
  });

  test("logs, searches, and votes locally without fetch", async () => {
    const backend = new LocalBackend(dbPath);
    const { id } = await backend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });

    await backend.vote({ id, isUpvote: true });

    const results = await backend.search({ query: "OAuth", limit: 5, mode: "keyword" });
    expect(results[0]).toMatchObject({
      id,
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
      score: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("hybrid search uses keyword fallback", async () => {
    const backend = new LocalBackend(dbPath);
    await backend.log({
      problem: "CORS startup failure",
      solution: "Check local Postgres first",
      tags: "cors",
    });

    const results = await backend.search({ query: "startup", limit: 5, mode: "hybrid" });

    expect(results).toHaveLength(1);
    expect(results[0]!.problem).toBe("CORS startup failure");
  });

  test("tiered keyword search falls back from exact AND to relaxed prefix OR", async () => {
    const backend = new LocalBackend(dbPath);
    await backend.log({
      problem: "Vite dev server is unreachable from a container",
      solution: "Bind Vite to 0.0.0.0 with --host.",
      tags: "vite,container",
    });

    await expect(
      backend.searchExactKeyword!({
        query: "vite container page cannot be reached from host",
        limit: 5,
      }),
    ).resolves.toEqual([]);
    const results = await backend.search({
      query: "vite container page cannot be reached from host",
      limit: 5,
      mode: "keyword",
    });
    expect(results[0]?.problem).toContain("unreachable");
  });

  test("treats leading hyphens as technical punctuation rather than negation", async () => {
    const backend = new LocalBackend(dbPath);
    await backend.log({
      problem: "SQLite WAL file keeps growing",
      solution: "Checkpoint WAL after long readers finish.",
      tags: "sqlite,wal",
    });

    const results = await backend.search({
      query: "sqlite -wal",
      limit: 5,
      mode: "keyword",
      keywordStrategy: "exact",
    });
    expect(results[0]?.problem).toContain("WAL");
  });

  test("hybrid search uses relaxed lexical candidates", async () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };
    const backend = new LocalBackend(dbPath, {
      semantic,
      embedder: { embed: async () => vector([1, 0, 0, 0]) },
    });
    await backend.log({
      problem: "Vite dev server is unreachable from a container",
      solution: "Bind the service to the host interface.",
      tags: "vite,container",
    });

    const results = await backend.search({
      query: "vite container page cannot be reached",
      limit: 5,
      mode: "hybrid",
    });
    expect(results[0]?.problem).toContain("unreachable");
  });

  test("semantic search returns a not-configured local error", async () => {
    const backend = new LocalBackend(dbPath);

    await expect(backend.search({ query: "startup", limit: 5, mode: "semantic" })).rejects.toThrow(
      "Local semantic search is not configured yet.",
    );
  });

  test("semantic search uses sqlite-vec with a local embedder", async () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };
    const embedder = {
      async embed(text: string) {
        return /oauth/i.test(text) ? vector([1, 0, 0, 0]) : vector([0, 1, 0, 0]);
      },
    };
    const backend = new LocalBackend(dbPath, { semantic, embedder });
    await backend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });
    await backend.log({
      problem: "SQLite migration failed",
      solution: "Run the migration before opening the app",
      tags: "sqlite",
    });

    const results = await backend.search({ query: "oauth redirect", limit: 1, mode: "semantic" });

    expect(results).toHaveLength(1);
    expect(results[0]!.problem).toBe("OAuth callback timeout");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("logs long local solutions with immediate semantic indexing", async () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };
    const embedder = {
      embed: vi.fn(async () => vector([1, 0, 0, 0])),
    };
    const backend = new LocalBackend(dbPath, { semantic, embedder });
    const longSolution = "Use chunked local embedding. ".repeat(200);

    const result = await backend.log({
      problem: "Long local solution cannot be embedded",
      solution: longSolution,
      tags: "local,semantic",
    });

    expect(result.warning).toBeUndefined();
    expect(embedder.embed).toHaveBeenCalledWith(expect.stringContaining(longSolution.trim()));
    expect(await backend.status()).toMatchObject({ embeddedSolutions: 1, pendingEmbeddings: 0 });
  });

  test("local embed drains pending long solutions", async () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };
    const loggingBackend = new LocalBackend(dbPath, {
      semantic: { ...semantic, enabled: false },
    });
    await loggingBackend.log({
      problem: "Long pending solution",
      solution: "The pending solution is intentionally verbose. ".repeat(200),
      tags: "local,semantic",
    });

    const embeddingBackend = new LocalBackend(dbPath, {
      semantic,
      embedder: { embed: async () => vector([1, 0, 0, 0]) },
    });

    expect(await embeddingBackend.status()).toMatchObject({
      embeddedSolutions: 0,
      pendingEmbeddings: 1,
    });
    await expect(embeddingBackend.embedPending()).resolves.toEqual({ embedded: 1 });
    expect(await embeddingBackend.status()).toMatchObject({
      embeddedSolutions: 1,
      pendingEmbeddings: 0,
    });
  });

  test("re-embeds solutions with current metadata but missing vector rows", async () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };
    const embedder = {
      async embed(text: string) {
        return /oauth/i.test(text) ? vector([1, 0, 0, 0]) : vector([0, 1, 0, 0]);
      },
    };
    const backend = new LocalBackend(dbPath, { semantic, embedder });
    await backend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });

    (backend as any).db.prepare("DELETE FROM solution_vec").run();

    const staleStatus = await backend.status();
    expect(staleStatus.pendingEmbeddings).toBe(1);
    expect(staleStatus.embeddedSolutions).toBe(0);

    await expect(backend.embedPending()).resolves.toEqual({ embedded: 1 });
    const results = await backend.search({ query: "oauth redirect", limit: 1, mode: "semantic" });

    expect(results).toHaveLength(1);
    expect(results[0]!.problem).toBe("OAuth callback timeout");
  });

  test("status loads sqlite-vec before inspecting vector rows from an existing database", async () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };
    const firstBackend = new LocalBackend(dbPath, {
      semantic,
      embedder: { embed: async () => vector([1, 0, 0, 0]) },
    });
    await firstBackend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });

    const freshBackend = new LocalBackend(dbPath, {
      semantic,
      embedder: { embed: async () => vector([1, 0, 0, 0]) },
    });

    await expect(freshBackend.status()).resolves.toMatchObject({
      embeddedSolutions: 1,
      pendingEmbeddings: 0,
    });
  });

  test("embedding fingerprint changes when model file contents change", () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };

    const first = embeddingFingerprintForConfig(semantic);
    writeGguf(modelPath, "replacement-model");
    const second = embeddingFingerprintForConfig(semantic);

    expect(second).not.toBe(first);
  });

  test("local embedding metadata uses node-llama-cpp", () => {
    expect(LOCAL_EMBEDDER_ID).toBe("node-llama-cpp");
  });

  test("converts embedding vectors to explicit float32 sqlite blobs", () => {
    const buffer = floatVectorToBuffer([1.5, -2.25], 2);

    expect(buffer).toHaveLength(8);
    expect(buffer.readFloatLE(0)).toBe(1.5);
    expect(buffer.readFloatLE(4)).toBe(-2.25);
  });

  test("rejects local embedding vectors with unexpected dimensions", () => {
    expect(() => floatVectorToBuffer([1, 2, 3], 4)).toThrow(
      "node-llama-cpp returned 3 embedding dimensions",
    );
  });

  test("replacing a model file at the same path makes existing embeddings pending", async () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };
    const backend = new LocalBackend(dbPath, {
      semantic,
      embedder: { embed: async () => vector([1, 0, 0, 0]) },
    });
    await backend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });

    expect(await backend.status()).toMatchObject({ embeddedSolutions: 1, pendingEmbeddings: 0 });

    writeGguf(modelPath, "replacement-model");

    expect(await backend.status()).toMatchObject({ embeddedSolutions: 0, pendingEmbeddings: 1 });
  });

  test("rejects empty search queries at the backend", async () => {
    const backend = new LocalBackend(dbPath);
    await expect(backend.search({ query: "   ", limit: 5, mode: "keyword" })).rejects.toThrow(
      "search query must not be empty",
    );
  });
});

describe("ftsQuery", () => {
  test("simple mode quotes each term and joins with implicit AND", () => {
    expect(ftsQuery("oauth redirect")).toBe('"oauth" "redirect"');
  });

  test("simple mode extracts double-quoted phrases", () => {
    expect(ftsQuery('"oauth callback" timeout')).toBe('"oauth callback" "timeout"');
  });

  test("simple mode breaks URLs into space-separated fragments", () => {
    const result = ftsQuery("https://example.com/path?x=1");
    expect(result).toContain('"https"');
    expect(result).not.toContain("://");
  });

  test("empty or whitespace-only queries yield an empty string", () => {
    expect(ftsQuery("")).toBe("");
    expect(ftsQuery("   ")).toBe("");
  });

  test("simple mode rejects bare leading-dash negation", () => {
    expect(() => ftsQuery("-foo")).toThrow(FtsQuerySyntaxError);
  });

  test("advanced mode preserves the AND operator", () => {
    expect(ftsQuery("database AND crash")).toBe('"database" AND "crash"');
  });

  test("advanced mode preserves the OR operator with prefix terms", () => {
    expect(ftsQuery('"some phrase" OR react*')).toBe('"some phrase" OR "react"*');
  });

  test("advanced mode preserves binary NOT", () => {
    expect(ftsQuery("database NOT physics")).toBe('"database" NOT "physics"');
  });

  test("advanced mode renders column filters against known columns", () => {
    expect(ftsQuery("tags:react hooks")).toBe('tags : "react" AND "hooks"');
  });

  test("advanced mode rejects unknown column filters", () => {
    expect(() => ftsQuery("foo:bar")).toThrow(FtsQuerySyntaxError);
  });

  test("advanced mode rejects a leading NOT", () => {
    expect(() => ftsQuery("NOT x")).toThrow(FtsQuerySyntaxError);
  });

  test("advanced mode rejects doubled operators", () => {
    expect(() => ftsQuery("database AND AND crash")).toThrow(FtsQuerySyntaxError);
  });

  test("advanced mode rejects unmatched parentheses", () => {
    expect(() => ftsQuery("(database AND crash")).toThrow(FtsQuerySyntaxError);
    expect(() => ftsQuery("database AND crash)")).toThrow(FtsQuerySyntaxError);
  });

  test("advanced mode rejects adjacent terms without an operator", () => {
    expect(() => ftsQuery("database crash AND")).toThrow(FtsQuerySyntaxError);
  });

  test("rejects SQL-injection-style query as a syntax error", () => {
    expect(() => ftsQuery("' OR '1'='1")).toThrow(FtsQuerySyntaxError);
  });

  test("rejects the BM25 weighting tilde operator", () => {
    expect(() => ftsQuery("database ~ crash")).toThrow(FtsQuerySyntaxError);
  });

  test("rejects an unterminated double-quoted phrase", () => {
    expect(() => ftsQuery('"unterminated')).toThrow(FtsQuerySyntaxError);
  });
});
