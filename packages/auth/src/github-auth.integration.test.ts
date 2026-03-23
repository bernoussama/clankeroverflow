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
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
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
