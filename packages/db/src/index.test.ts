import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
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

    testDatabaseName = `clankeroverflow_db_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
    await db.delete(schema.kbChange);
    await db.delete(schema.kbDocument);
    await db.delete(schema.teamKb);
    await db.delete(schema.teamMember);
    await db.delete(schema.team);
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

  test("can create a team document for a user", async () => {
    const userId = "user-2";
    await db.insert(schema.user).values({
      id: userId,
      name: "Knowledge User",
      email: "kb@example.com",
    });
    await db.insert(schema.team).values({ id: "team-1", name: "Team", slug: "team" });
    await db.insert(schema.teamMember).values({ teamId: "team-1", userId, role: "owner" });
    await db.insert(schema.kbDocument).values({
      teamId: "team-1",
      docId: "doc-1",
      path: "backend/ts2307.md",
      rev: 1,
      contentHash: "abc",
      frontmatter: { title: "TS2307" },
      body: "Cannot find module",
      markdown: "# TS2307",
    });

    const [result] = await db
      .select()
      .from(schema.kbDocument)
      .where(eq(schema.kbDocument.docId, "doc-1"));

    expect(result?.path).toBe("backend/ts2307.md");
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
});
