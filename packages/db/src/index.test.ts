import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test, beforeAll } from "bun:test";
import * as schema from "./schema";

describe("Database Integration", () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let client: ReturnType<typeof createClient>;

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    db = drizzle(client, { schema });
    
    // Run migrations
    await migrate(db, { migrationsFolder: "./src/migrations" });
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
    const keyValue = "sk_test_12345";
    await db.insert(schema.apiKey).values({
      id: keyId,
      key: keyValue,
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
