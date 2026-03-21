import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import * as schema from "./schema";

describe("Database Integration", () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let pool: Pool;

  beforeAll(async () => {
    const connectionString =
      process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clankeroverflow";

    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });

    // Run migrations
    const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));
    await migrate(db, { migrationsFolder });
  });

  afterEach(async () => {
    await db.delete(schema.solutionVote);
    await db.delete(schema.solution);
    await db.delete(schema.apiKey);
    await db.delete(schema.account);
    await db.delete(schema.session);
    await db.delete(schema.verification);
    await db.delete(schema.user);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("can insert and retrieve a user", async () => {
    const userId = "user-1";
    await db.insert(schema.user).values({
      id: userId,
      name: "Test User",
      email: "test@example.com",
    });

    const result = await db.query.user.findFirst({
      where: (u, { eq }) => eq(u.id, userId),
    });

    expect(result).toBeDefined();
    expect(result?.name).toBe("Test User");
  });

  test("can create a solution and link to user", async () => {
    const userId = "user-2";
    await db.insert(schema.user).values({
      id: userId,
      name: "Solution User",
      email: "sol@example.com",
    });

    const solutionId = "sol-1";
    await db.insert(schema.solution).values({
      id: solutionId,
      problem: "Test problem",
      solution: "Test solution",
      userId,
      tags: "test",
    });

    const result = await db.query.solution.findFirst({
      where: (s, { eq }) => eq(s.id, solutionId),
      with: {
        user: true,
      },
    });

    expect(result).toBeDefined();
    expect(result?.problem).toBe("Test problem");
    expect(result?.user?.name).toBe("Solution User");
  });

  test("can create api key for user", async () => {
    const userId = "user-3";
    await db.insert(schema.user).values({
      id: userId,
      name: "API Key User",
      email: "api@example.com",
    });

    const keyId = "key-1";
    const keyValue = "a".repeat(64);
    await db.insert(schema.apiKey).values({
      id: keyId,
      key: keyValue,
      keyPreview: "clk_test...2345",
      userId,
      name: "Test Key",
    });

    const result = await db.query.apiKey.findFirst({
      where: (k, { eq }) => eq(k.key, keyValue),
      with: {
        user: true,
      },
    });

    expect(result).toBeDefined();
    expect(result?.name).toBe("Test Key");
    expect(result?.user?.email).toBe("api@example.com");
  });
});
