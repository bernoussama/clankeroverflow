import { schema } from "@clankeroverflow/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import { createAuth } from "./index";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clankeroverflow";

describe("GitHub auth + PostgreSQL", () => {
  let adminPool: Pool | undefined;
  let pool: Pool | undefined;
  let db: ReturnType<typeof drizzle<typeof schema>> | undefined;
  let testDatabaseName: string | undefined;

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
    if (!db) return;
    await db!.delete(schema.passkey);
    await db!.delete(schema.account);
    await db!.delete(schema.user);
  });

  afterAll(async () => {
    await pool?.end().catch(() => {});
    if (adminPool && testDatabaseName) {
      await adminPool
        .query(
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [testDatabaseName],
        )
        .catch(() => {});
      await adminPool.query(`DROP DATABASE IF EXISTS "${testDatabaseName}"`).catch(() => {});
    }
    await adminPool?.end().catch(() => {});
  });

  test("createAuth initializes against a live Postgres schema", () => {
    const auth = createAuth(db!);
    expect(auth).toBeDefined();
    expect(typeof auth.handler).toBe("function");
  });

  test("Better Auth Drizzle schema supports GitHub account linkage rows", async () => {
    const userId = "integration-github-user";
    await db!.insert(schema.user).values({
      id: userId,
      name: "Integration GitHub User",
      email: "integration-github@example.com",
    });

    await db!.insert(schema.account).values({
      id: "integration-github-account",
      accountId: "987654321",
      providerId: "github",
      userId,
    });

    const row = await db!.query.account.findFirst({
      where: (a, { eq }) => eq(a.userId, userId),
      with: { user: true },
    });

    expect(row).toBeDefined();
    expect(row?.providerId).toBe("github");
    expect(row?.user?.email).toBe("integration-github@example.com");
  });

  test("Better Auth Drizzle schema supports passkey rows for the user", async () => {
    const userId = "integration-passkey-user";
    await db!.insert(schema.user).values({
      id: userId,
      name: "Integration Passkey User",
      email: "integration-passkey@example.com",
    });

    const passkeyId = "integration-passkey-1";
    await db!.insert(schema.passkey).values({
      id: passkeyId,
      name: "Integration key",
      publicKey: "cHVibGljLWtleQ",
      userId,
      credentialID: "cred-integration-passkey",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: true,
      transports: "usb,internal",
      createdAt: new Date(),
    });

    const row = await db!.query.passkey.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
      with: { user: true },
    });

    expect(row).toBeDefined();
    expect(row?.credentialID).toBe("cred-integration-passkey");
    expect(row?.user?.email).toBe("integration-passkey@example.com");
  });

  test("deleting user cascades to passkeys", async () => {
    const userId = "integration-cascade-user";
    await db!.insert(schema.user).values({
      id: userId,
      name: "Cascade User",
      email: "cascade@example.com",
    });

    await db!.insert(schema.passkey).values({
      id: "integration-cascade-pk",
      name: "Cascade key",
      publicKey: "e",
      userId,
      credentialID: "cred-cascade",
      counter: 1,
      deviceType: "singleDevice",
      backedUp: false,
      createdAt: new Date(),
    });

    await db!.delete(schema.user).where(eq(schema.user.id, userId));

    const remaining = await db!.query.passkey.findMany({
      where: (p, { eq }) => eq(p.userId, userId),
    });

    expect(remaining).toHaveLength(0);
  });
});
