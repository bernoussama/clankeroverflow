import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

import { LocalBackend } from "./local-backend";
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
});
