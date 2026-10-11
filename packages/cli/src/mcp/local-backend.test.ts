import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

import { ftsQuery, FtsQuerySyntaxError, LocalBackend } from "./local-backend";
import { openLocalDb } from "./local-db";

describe("CLI local MCP backend", () => {
  let dir: string;
  let dbPath: string;
  let fetchMock: MockInstance<typeof global.fetch>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clanker-mcp-"));
    dbPath = join(dir, "solutions.sqlite");
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

  test("rejects empty search queries at the backend", async () => {
    const backend = new LocalBackend(dbPath);
    await expect(backend.search({ query: "   ", limit: 5, mode: "keyword" })).rejects.toThrow(
      "search query must not be empty",
    );
  });

  test("exact keyword search honors the AND operator", async () => {
    const backend = new LocalBackend(dbPath);
    const { id } = await backend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });
    await backend.log({
      problem: "OAuth misconfiguration only",
      solution: "Check redirect URIs.",
      tags: "auth",
    });

    const results = await backend.search({
      query: "OAuth AND timeout",
      limit: 5,
      mode: "keyword",
      keywordStrategy: "exact",
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(id);
  });

  test("exact keyword search honors column filters", async () => {
    const backend = new LocalBackend(dbPath);
    await backend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });
    await backend.log({
      problem: "Startup race condition",
      solution: "Await initialization.",
      tags: "init",
    });

    const results = await backend.search({
      query: "tags:auth",
      limit: 5,
      mode: "keyword",
      keywordStrategy: "exact",
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.problem).toBe("OAuth callback timeout");
  });

  test("exact keyword search rejects a malformed advanced query", async () => {
    const backend = new LocalBackend(dbPath);
    await backend.log({
      problem: "Database crash",
      solution: "Restart the service.",
      tags: "db",
    });

    await expect(
      backend.search({
        query: "database AND",
        limit: 5,
        mode: "keyword",
        keywordStrategy: "exact",
      }),
    ).rejects.toThrow(FtsQuerySyntaxError);
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

  test("simple mode treats a leading dash as punctuation, not negation", () => {
    expect(ftsQuery("-foo")).toBe('"foo"');
    expect(ftsQuery("sqlite -wal")).toBe('"sqlite" "wal"');
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

  test("advanced mode preserves balanced parentheses as a group", () => {
    expect(ftsQuery("(database OR crash) AND startup")).toBe(
      '( "database" OR "crash" ) AND "startup"',
    );
  });

  test("advanced mode normalizes NEAR(...) comma form to space-separated FTS5", () => {
    expect(ftsQuery("NEAR(token, nft, 5)")).toBe("NEAR(token nft, 5)");
    expect(ftsQuery("NEAR(oauth timeout)")).toBe("NEAR(oauth timeout)");
    expect(ftsQuery("NEAR(token, nft)")).toBe("NEAR(token nft)");
  });

  test("advanced mode rejects an unterminated NEAR(...) expression", () => {
    expect(() => ftsQuery("NEAR(token nft")).toThrow(FtsQuerySyntaxError);
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
