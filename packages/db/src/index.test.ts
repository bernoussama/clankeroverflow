import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq, and } from "drizzle-orm";
import { describe, expect, test, beforeAll } from "bun:test";
import * as schema from "./schema";

describe("Database Integration", () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let client: ReturnType<typeof createClient>;

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "./src/migrations" });
  });

  describe("user table", () => {
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
      expect(result?.emailVerified).toBe(false);
    });

    test("enforces unique email constraint", async () => {
      await db.insert(schema.user).values({
        id: "user-dup-1",
        name: "First",
        email: "unique@example.com",
      });

      let threw = false;
      try {
        await db.insert(schema.user).values({
          id: "user-dup-2",
          name: "Second",
          email: "unique@example.com",
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  describe("solution table", () => {
    test("can create a solution linked to a user", async () => {
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
        tags: "test,example",
      });

      const result = await db.query.solution.findFirst({
        where: (s, { eq }) => eq(s.id, solutionId),
        with: { user: true },
      });

      expect(result).toBeDefined();
      expect(result?.problem).toBe("Test problem");
      expect(result?.tags).toBe("test,example");
      expect(result?.user?.name).toBe("Solution User");
    });

    test("allows null userId for anonymous solutions", async () => {
      const solutionId = "sol-anon";
      await db.insert(schema.solution).values({
        id: solutionId,
        problem: "Anon problem",
        solution: "Anon solution",
        userId: null,
      });

      const result = await db.query.solution.findFirst({
        where: (s, { eq }) => eq(s.id, solutionId),
      });

      expect(result).toBeDefined();
      expect(result?.userId).toBeNull();
    });

    test("has a default score of 0", async () => {
      const solutionId = "sol-score";
      await db.insert(schema.solution).values({
        id: solutionId,
        problem: "Score test",
        solution: "Answer",
        userId: null,
      });

      const result = await db.query.solution.findFirst({
        where: (s, { eq }) => eq(s.id, solutionId),
      });

      expect(result?.score).toBe(0);
    });
  });

  describe("solution_vote table", () => {
    test("can insert and retrieve a vote", async () => {
      const userId = "user-voter";
      await db.insert(schema.user).values({
        id: userId,
        name: "Voter",
        email: "voter@example.com",
      });

      const solutionId = "sol-votable";
      await db.insert(schema.solution).values({
        id: solutionId,
        problem: "Votable",
        solution: "Vote on this",
        userId,
      });

      await db.insert(schema.solutionVote).values({
        userId,
        solutionId,
        isUpvote: true,
      });

      const result = await db.query.solutionVote.findFirst({
        where: and(
          eq(schema.solutionVote.userId, userId),
          eq(schema.solutionVote.solutionId, solutionId),
        ),
      });

      expect(result).toBeDefined();
      expect(result?.isUpvote).toBe(true);
    });

    test("enforces composite primary key (one vote per user per solution)", async () => {
      const userId = "user-voter";
      const solutionId = "sol-votable";

      let threw = false;
      try {
        await db.insert(schema.solutionVote).values({
          userId,
          solutionId,
          isUpvote: false,
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });

    test("cascades delete when solution is removed", async () => {
      const userId = "user-cascade";
      await db.insert(schema.user).values({
        id: userId,
        name: "Cascade User",
        email: "cascade@example.com",
      });

      const solutionId = "sol-cascade";
      await db.insert(schema.solution).values({
        id: solutionId,
        problem: "Will be deleted",
        solution: "Gone",
        userId,
      });

      await db.insert(schema.solutionVote).values({
        userId,
        solutionId,
        isUpvote: true,
      });

      await db.delete(schema.solution).where(eq(schema.solution.id, solutionId));

      const vote = await db.query.solutionVote.findFirst({
        where: eq(schema.solutionVote.solutionId, solutionId),
      });

      expect(vote).toBeUndefined();
    });
  });

  describe("apikey table (Better Auth plugin)", () => {
    test("can insert and retrieve an API key", async () => {
      const keyId = "apikey-1";
      await db.insert(schema.apikey).values({
        id: keyId,
        key: "hashed_key_value",
        referenceId: "user-1",
        name: "Test Key",
        start: "clk_abc",
        prefix: "clk",
        configId: "default",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await db.query.apikey.findFirst({
        where: (k, { eq }) => eq(k.id, keyId),
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe("Test Key");
      expect(result?.referenceId).toBe("user-1");
      expect(result?.start).toBe("clk_abc");
    });

    test("has configId defaulting to 'default'", async () => {
      const keyId = "apikey-default-config";
      await db.insert(schema.apikey).values({
        id: keyId,
        key: "hashed_key_2",
        referenceId: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await db.query.apikey.findFirst({
        where: (k, { eq }) => eq(k.id, keyId),
      });

      expect(result?.configId).toBe("default");
    });

    test("enabled defaults to true", async () => {
      const keyId = "apikey-enabled";
      await db.insert(schema.apikey).values({
        id: keyId,
        key: "hashed_key_3",
        referenceId: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await db.query.apikey.findFirst({
        where: (k, { eq }) => eq(k.id, keyId),
      });

      expect(result?.enabled).toBe(true);
    });
  });
});
