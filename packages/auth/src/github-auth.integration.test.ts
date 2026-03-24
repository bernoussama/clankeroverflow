import { schema } from "@clankeroverflow/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import { createAuth } from "./index";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clankeroverflow";

describe("GitHub auth + PostgreSQL", () => {
  let adminPool: Pool;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let testDatabaseName: string;

  beforeAll(async () => {
    const baseUrl = new URL(connectionString);
    const adminUrl = new URL(baseUrl);
    adminUrl.pathname = "/postgres";

    testDatabaseName = `clankeroverflow_auth_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    adminPool = new Pool({ connectionString: adminUrl.toString() });
    await adminPool.query(`CREATE DATABASE "${testDatabaseName}"`);

    const testUrl = new URL(baseUrl);
    testUrl.pathname = `/${testDatabaseName}`;

    pool = new Pool({ connectionString: testUrl.toString() });
    db = drizzle(pool, { schema });
    const migrationsFolder = fileURLToPath(new URL("../../db/src/migrations", import.meta.url));
    await migrate(db, { migrationsFolder });
  });

  afterEach(async () => {
    await db.delete(schema.account);
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

  test("createAuth initializes against a live Postgres schema", () => {
    const auth = createAuth(db);
    expect(auth).toBeDefined();
    expect(typeof auth.handler).toBe("function");
  });

  test("Better Auth Drizzle schema supports GitHub account linkage rows", async () => {
    const userId = "integration-github-user";
    await db.insert(schema.user).values({
      id: userId,
      name: "Integration GitHub User",
      email: "integration-github@example.com",
    });

    await db.insert(schema.account).values({
      id: "integration-github-account",
      accountId: "987654321",
      providerId: "github",
      userId,
    });

    const row = await db.query.account.findFirst({
      where: (a, { eq }) => eq(a.userId, userId),
      with: { user: true },
    });

    expect(row).toBeDefined();
    expect(row?.providerId).toBe("github");
    expect(row?.user?.email).toBe("integration-github@example.com");
  });
});
