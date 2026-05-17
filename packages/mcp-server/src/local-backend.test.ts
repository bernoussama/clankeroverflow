import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

import { LocalBackend } from "./local-backend";
import { openLocalDb } from "./local-db";

describe("LocalBackend", () => {
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

  test("logs a solution row and matching FTS row", async () => {
    const backend = new LocalBackend(dbPath);

    const result = await backend.log({
      problem: "Wrangler hangs during OAuth callback",
      solution: "Use request-scoped database clients and keep waitUntil tasks alive.",
      tags: "cloudflare,better-auth",
    });

    const db = openLocalDb(dbPath);
    const row = db.prepare("SELECT * FROM solution WHERE id = ?").get(result.id) as
      | { problem: string; solution: string; tags: string }
      | undefined;
    const ftsRow = db.prepare("SELECT problem, solution, tags FROM solution_fts WHERE rowid = (SELECT rowid FROM solution WHERE id = ?)").get(result.id) as
      | { problem: string; solution: string; tags: string }
      | undefined;

    expect(row?.problem).toBe("Wrangler hangs during OAuth callback");
    expect(row?.solution).toContain("request-scoped database clients");
    expect(row?.tags).toBe("cloudflare,better-auth");
    expect(ftsRow).toEqual({ problem: row!.problem, solution: row!.solution, tags: row!.tags });

    db.close();
  });

  test("search finds problem, solution, and tags text and respects limit", async () => {
    const backend = new LocalBackend(dbPath);
    await backend.log({ problem: "OAuth callback timeout", solution: "Keep waitUntil tasks alive", tags: "auth" });
    await backend.log({ problem: "Postgres pool timeout", solution: "Use request scoped clients", tags: "database" });
    await backend.log({ problem: "Vector index mismatch", solution: "Recreate Vectorize index", tags: "cloudflare" });

    expect((await backend.search({ query: "OAuth", limit: 5, mode: "keyword" })).map((row) => row.problem)).toContain("OAuth callback timeout");
    expect((await backend.search({ query: "scoped", limit: 5, mode: "keyword" })).map((row) => row.solution)).toContain("Use request scoped clients");
    expect((await backend.search({ query: "cloudflare", limit: 1, mode: "keyword" }))).toHaveLength(1);
  });

  test("hybrid search uses keyword fallback", async () => {
    const backend = new LocalBackend(dbPath);
    await backend.log({ problem: "CORS startup failure", solution: "Check local Postgres first", tags: "cors" });

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

  test("votes set and update a single local score", async () => {
    const backend = new LocalBackend(dbPath);
    const { id } = await backend.log({ problem: "Slow search", solution: "Add an index", tags: "sqlite" });

    await backend.vote({ id, isUpvote: true });
    expect((await backend.search({ query: "search", limit: 1, mode: "keyword" }))[0]!.score).toBe(1);

    await backend.vote({ id, isUpvote: false });
    expect((await backend.search({ query: "search", limit: 1, mode: "keyword" }))[0]!.score).toBe(-1);
  });

  test("voting for a missing solution returns a clear not-found error", async () => {
    const backend = new LocalBackend(dbPath);

    await expect(backend.vote({ id: "missing", isUpvote: true })).rejects.toThrow(
      "Local solution not found: missing",
    );
  });

  test("local backend does not call fetch", async () => {
    const backend = new LocalBackend(dbPath);
    await backend.log({ problem: "Local privacy", solution: "Never call hosted APIs", tags: "privacy" });
    await backend.search({ query: "privacy", limit: 1, mode: "keyword" });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
