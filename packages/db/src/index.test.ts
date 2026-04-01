import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import * as schema from "./schema";

describe("Database Integration", () => {
  let adminPool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let pool: Pool;
  let testDatabaseName: string;

  beforeAll(async () => {
    const connectionString =
      process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clankeroverflow";
    const baseUrl = new URL(connectionString);
    const adminUrl = new URL(baseUrl);
    adminUrl.pathname = "/postgres";

    testDatabaseName = `clankeroverflow_db_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    adminPool = new Pool({ connectionString: adminUrl.toString() });
    await adminPool.query(`CREATE DATABASE "${testDatabaseName}"`);

    const testUrl = new URL(baseUrl);
    testUrl.pathname = `/${testDatabaseName}`;

    pool = new Pool({ connectionString: testUrl.toString() });
    db = drizzle(pool, { schema });

    // Run migrations
    const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));
    await migrate(db, { migrationsFolder });
  });

  afterEach(async () => {
    await db.delete(schema.solutionVote);
    await db.delete(schema.solution);
    await db.delete(schema.apikey);
    await db.delete(schema.passkey);
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
    const keyValue = "a".repeat(86);
    await db.insert(schema.apikey).values({
      id: keyId,
      configId: "default",
      key: keyValue,
      start: "clk_test",
      referenceId: userId,
      prefix: "clk_",
      name: "Test Key",
      updatedAt: new Date(),
    });

    const result = await db.query.apikey.findFirst({
      where: (k, { eq }) => eq(k.key, keyValue),
      with: {
        user: true,
      },
    });

    expect(result).toBeDefined();
    expect(result?.name).toBe("Test Key");
    expect(result?.user?.email).toBe("api@example.com");
  });

  test("can create passkey row linked to user", async () => {
    const userId = "user-passkey-1";
    await db.insert(schema.user).values({
      id: userId,
      name: "Passkey User",
      email: "passkey@example.com",
    });

    const passkeyId = "pk-1";
    await db.insert(schema.passkey).values({
      id: passkeyId,
      name: "Test passkey",
      publicKey: "dGVzdC1rZXk",
      userId,
      credentialID: "cred-integration-1",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: "internal",
      createdAt: new Date(),
    });

    const row = await db.query.passkey.findFirst({
      where: (p, { eq }) => eq(p.id, passkeyId),
      with: { user: true },
    });

    expect(row).toBeDefined();
    expect(row?.name).toBe("Test passkey");
    expect(row?.credentialID).toBe("cred-integration-1");
    expect(row?.user?.email).toBe("passkey@example.com");
  });
});
