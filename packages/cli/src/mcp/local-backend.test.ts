import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

import { LocalBackend } from "./local-backend";
import { openLocalDb } from "./local-db";
import { embeddingFingerprintForConfig, type LocalSemanticConfig } from "./local-semantic";

function vector(values: number[]) {
  return Buffer.from(new Float32Array(values).buffer);
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
      embed(text: string) {
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

  test("re-embeds solutions with current metadata but missing vector rows", async () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };
    const embedder = {
      embed(text: string) {
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
      embedder: { embed: () => vector([1, 0, 0, 0]) },
    });
    await firstBackend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });

    const freshBackend = new LocalBackend(dbPath, {
      semantic,
      embedder: { embed: () => vector([1, 0, 0, 0]) },
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

  test("replacing a model file at the same path makes existing embeddings pending", async () => {
    const semantic: LocalSemanticConfig = {
      enabled: true,
      modelId: "test-model",
      modelPath,
      dimensions: 4,
    };
    const backend = new LocalBackend(dbPath, {
      semantic,
      embedder: { embed: () => vector([1, 0, 0, 0]) },
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
});
