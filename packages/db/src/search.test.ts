import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import * as schema from "./schema";
import { searchSolutions } from "./search";

const DEFAULT_CONNECTION_STRING =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clankeroverflow";

describe("searchSolutions", () => {
  let adminPool: Pool;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let testDatabaseName: string;

  beforeAll(async () => {
    const baseUrl = new URL(DEFAULT_CONNECTION_STRING);
    const adminUrl = new URL(baseUrl);
    adminUrl.pathname = "/postgres";

    testDatabaseName = `clankeroverflow_search_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    adminPool = new Pool({ connectionString: adminUrl.toString() });
    await adminPool.query(`CREATE DATABASE "${testDatabaseName}"`);

    const testUrl = new URL(baseUrl);
    testUrl.pathname = `/${testDatabaseName}`;

    pool = new Pool({ connectionString: testUrl.toString() });
    db = drizzle(pool, { schema });

    const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));
    await migrate(db, { migrationsFolder });
  });

  afterEach(async () => {
    await db.delete(schema.solutionVote);
    await db.delete(schema.solution);
    await db.delete(schema.apikey);
    await db.delete(schema.account);
    await db.delete(schema.session);
    await db.delete(schema.verification);
    await db.delete(schema.user);
  });

  afterAll(async () => {
    await pool.end();
    await adminPool.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [testDatabaseName],
    );
    await adminPool.query(`DROP DATABASE "${testDatabaseName}"`);
    await adminPool.end();
  });

  test("ranks exact keyword matches ahead of newer partial matches", async () => {
    await db.insert(schema.solution).values({
      id: "sol-exact",
      problem: "Next.js cache invalidation in the app router",
      solution: "Use updateTag to invalidate the exact cache entry you need.",
      tags: "nextjs,cache,invalidation",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    await db.insert(schema.solution).values({
      id: "sol-partial",
      problem: "General cache invalidation tactics for web apps",
      solution: "In Next.js projects, cache layers can be refreshed with broader strategies.",
      tags: "nextjs,cache",
    });

    const results = await searchSolutions(db, {
      query: "nextjs cache invalidation",
      limit: 2,
    });

    expect(results.map((r) => r.id)).toEqual(["sol-exact", "sol-partial"]);
  });

  test("returns fuzzy matches for minor misspellings", async () => {
    await db.insert(schema.solution).values({
      id: "sol-fuzzy",
      problem: "Postgres full text search for saved solutions",
      solution: "Combine tsvector ranking with pg_trgm similarity for typo-tolerant matches.",
      tags: "postgres,search,pg_trgm",
    });

    const results = await searchSolutions(db, {
      query: "pstgres serch",
      limit: 1,
      strategy: "tiered",
    });

    expect(results.map((r) => r.id)).toEqual(["sol-fuzzy"]);
  });

  test("tiered search fills from relaxed prefix matches after strict matches", async () => {
    await db.insert(schema.solution).values([
      {
        id: "sol-strict",
        problem: "Vite container host unreachable",
        solution: "Bind the Vite server to the host interface.",
        tags: "vite,container",
      },
      {
        id: "sol-relaxed",
        problem: "Vite server is unreachable from a container",
        solution: "Publish the configured port.",
        tags: "vite,container",
      },
    ]);

    const results = await searchSolutions(db, {
      query: "vite container host unreachable",
      limit: 2,
      strategy: "tiered",
    });

    expect(results.map((result) => result.id)).toEqual(["sol-strict", "sol-relaxed"]);
  });

  test("indexes and searches Unicode terms", async () => {
    await db.insert(schema.solution).values({
      id: "sol-unicode",
      problem: "فشل اتصال قاعدة البيانات",
      solution: "تحقق من عنوان الخادم وإعدادات الشبكة.",
      tags: "قاعدة-بيانات",
    });

    const results = await searchSolutions(db, {
      query: "اتصال قاعدة",
      limit: 1,
      strategy: "tiered",
    });

    expect(results.map((result) => result.id)).toEqual(["sol-unicode"]);
  });

  test("does not interpret technical leading hyphens as negation", async () => {
    await db.insert(schema.solution).values({
      id: "sol-flag",
      problem: "SQLite WAL file keeps growing",
      solution: "Checkpoint the WAL after readers finish.",
      tags: "sqlite,wal",
    });

    const results = await searchSolutions(db, {
      query: "sqlite -wal",
      limit: 1,
      strategy: "exact",
    });

    expect(results.map((result) => result.id)).toEqual(["sol-flag"]);
  });

  test("falls back to text ranking when pg_trgm is unavailable", async () => {
    await db.insert(schema.solution).values({
      id: "sol-fallback",
      problem: "Next.js cache invalidation in the app router",
      solution: "Use updateTag on the affected cache entry.",
      tags: "nextjs,cache",
    });

    await pool.query("DROP EXTENSION IF EXISTS pg_trgm CASCADE");

    const results = await searchSolutions(db, {
      query: "nextjs cache invalidation",
      limit: 1,
      strategy: "tiered",
    });

    expect(results.map((r) => r.id)).toEqual(["sol-fallback"]);
  });
});
