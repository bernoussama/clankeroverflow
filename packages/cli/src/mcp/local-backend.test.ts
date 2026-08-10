import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FtsQuerySyntaxError, LocalBackend } from "./local-backend";
import { openLocalDb } from "./local-db";

function openDbInChild(dbPath: string) {
  const moduleUrl = new URL("./local-db.ts", import.meta.url).href;
  const script = [
    `import { openLocalDb } from ${JSON.stringify(moduleUrl)};`,
    `const db = openLocalDb(${JSON.stringify(dbPath)});`,
    'console.log(db.prepare("SELECT COUNT(*) AS count FROM solution").get().count);',
    "db.close();",
  ].join("\n");

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--eval", script], {
      cwd: process.cwd(),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Migration child exited ${code}: ${stderr}`));
    });
  });
}

describe("CLI local keyword backend", () => {
  let directory: string;
  let dbPath: string;
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "clanker-mcp-"));
    dbPath = join(directory, "solutions.sqlite");
    fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () => {
      throw new Error("local mode must not call fetch");
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  });

  test("initializes only the solution, vote, migration, and FTS schema", () => {
    const db = openLocalDb(dbPath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual') ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((row) => row.name);
    expect(names).toContain("solution");
    expect(names).toContain("solution_vote");
    expect(names).toContain("solution_fts");
    expect(names).toContain("local_migration");
    expect(names).not.toContain("solution_vec");
    expect(names).not.toContain("solution_embedding");
    db.close();
  });

  test("logs, searches, reports status, and votes without fetch", async () => {
    const backend = new LocalBackend(dbPath);
    const { id } = await backend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });
    await backend.vote({ id, isUpvote: true });
    const results = await backend.search({ query: "OAuth", limit: 5 });
    expect(results[0]).toMatchObject({ id, score: 1, tags: "auth" });
    await expect(backend.status()).resolves.toMatchObject({
      totalSolutions: 1,
      integrity: true,
      fts5: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    backend.close();
  });

  test("tiered keyword search broadens after an empty exact search", async () => {
    const backend = new LocalBackend(dbPath);
    await backend.log({
      problem: "Vite dev server is unreachable from a container",
      solution: "Bind Vite to 0.0.0.0 with --host.",
      tags: "vite,container",
    });
    const query = "vite container page cannot be reached from host";
    await expect(backend.searchExactKeyword!({ query, limit: 5 })).resolves.toEqual([]);
    const results = await backend.search({ query, limit: 5, keywordStrategy: "tiered" });
    expect(results[0]?.problem).toContain("unreachable");
    backend.close();
  });

  test("supports advanced FTS syntax and rejects malformed expressions", async () => {
    const backend = new LocalBackend(dbPath);
    const { id } = await backend.log({
      problem: "OAuth callback timeout",
      solution: "Keep waitUntil tasks alive",
      tags: "auth",
    });
    await backend.log({ problem: "OAuth setup", solution: "Check redirect URI", tags: "auth" });
    const results = await backend.search({
      query: "tags:auth AND timeout",
      limit: 5,
      keywordStrategy: "exact",
    });
    expect(results.map((result) => result.id)).toEqual([id]);
    await expect(
      backend.search({ query: "database AND", limit: 5, keywordStrategy: "exact" }),
    ).rejects.toThrow(FtsQuerySyntaxError);
    backend.close();
  });

  test("rebuilds a legacy semantic schema without losing solutions or votes", async () => {
    const initial = openLocalDb(dbPath);
    initial
      .prepare(
        "INSERT INTO solution(id, problem, solution, tags, score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("legacy-1", "Legacy EADDRINUSE fix", "Choose a free port", "node", 2, "now", "now");
    initial
      .prepare("INSERT INTO solution_vote(solution_id, vote, created_at) VALUES (?, ?, ?)")
      .run("legacy-1", "up", "now");
    initial.exec(`
      CREATE TABLE solution_embedding (solution_id TEXT PRIMARY KEY, dimensions INTEGER);
      CREATE TABLE local_config (key TEXT PRIMARY KEY, value TEXT);
    `);
    initial.close();

    const backend = new LocalBackend(dbPath);
    const results = await backend.search({ query: "EADDRINUSE", limit: 5 });
    expect(results[0]).toMatchObject({ id: "legacy-1", score: 2 });
    backend.close();

    const migrated = openLocalDb(dbPath);
    const names = migrated
      .prepare(
        "SELECT name FROM sqlite_master WHERE name IN ('solution_vec', 'solution_embedding', 'local_config')",
      )
      .all();
    expect(names).toEqual([]);
    expect(migrated.prepare("SELECT count(*) AS count FROM solution_vote").get()).toEqual({
      count: 1,
    });
    migrated.close();
    expect(existsSync(`${dbPath}.semantic-v1.backup`)).toBe(false);
  });

  test("serializes concurrent legacy migrations across processes", async () => {
    const initial = openLocalDb(dbPath);
    const insert = initial.prepare(
      "INSERT INTO solution(id, problem, solution, tags, score, created_at, updated_at) VALUES (?, ?, ?, NULL, 0, 'now', 'now')",
    );
    initial.transaction(() => {
      for (let index = 0; index < 5_000; index += 1) {
        insert.run(`legacy-${index}`, `Problem ${index}`, `Solution ${index}`);
      }
    })();
    initial.exec("CREATE TABLE solution_embedding (solution_id TEXT PRIMARY KEY)");
    initial.close();

    const children = await Promise.all(Array.from({ length: 4 }, () => openDbInChild(dbPath)));
    expect(children.map(({ stdout }) => stdout.trim())).toEqual(Array(4).fill("5000"));

    const migrated = openLocalDb(dbPath);
    expect(migrated.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(migrated.prepare("SELECT COUNT(*) AS count FROM solution").get()).toEqual({
      count: 5_000,
    });
    expect(migrated.prepare("SELECT COUNT(*) AS count FROM solution_fts").get()).toEqual({
      count: 5_000,
    });
    migrated.close();
    expect(existsSync(`${dbPath}.semantic-v1.backup`)).toBe(false);
  });
});
