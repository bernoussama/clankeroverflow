import { describe, expect, test, beforeEach } from "bun:test";
import { appRouter } from "./index";
import { t } from "../index";
import { db } from "@clankeroverflow/db";
import { auth } from "@clankeroverflow/auth";

const createCaller = t.createCallerFactory(appRouter);

const mockSession = {
  session: {
    id: "sess_1",
    userId: "user_1",
    expiresAt: new Date(),
    token: "tok_1",
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "user_1",
    email: "test@example.com",
    name: "Test User",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

function clearMocks() {
  (db.query.solution.findMany as any).mockClear();
  (db.query.solution.findFirst as any).mockClear();
  (db.query.solutionVote.findFirst as any).mockClear();
  (db.insert as any).mockClear();
  (db.update as any).mockClear();
  (db.delete as any).mockClear();
  (db.select as any).mockClear();
  (auth.api.verifyApiKey as any).mockClear();
}

describe("solutionsRouter", () => {
  beforeEach(clearMocks);

  // ─── search ───

  describe("search", () => {
    test("returns empty array when query is only whitespace", async () => {
      const caller = createCaller({ session: null, apiKey: null });
      const result = await caller.solutions.search({ query: "   " });
      expect(result).toEqual([]);
    });

    test("returns results from findMany", async () => {
      (db.query.solution.findMany as any).mockResolvedValueOnce([
        { id: "sol_1", problem: "Cache issue", solution: "Clear cache", score: 0 },
      ]);

      const caller = createCaller({ session: null, apiKey: null });
      const result = await caller.solutions.search({ query: "cache" });
      expect(result).toHaveLength(1);
      expect(result[0].problem).toBe("Cache issue");
    });

    test("splits multi-word queries into separate LIKE terms", async () => {
      (db.query.solution.findMany as any).mockResolvedValueOnce([]);

      const caller = createCaller({ session: null, apiKey: null });
      await caller.solutions.search({ query: "next cache deploy" });
      expect(db.query.solution.findMany).toHaveBeenCalled();
    });

    test("respects limit parameter", async () => {
      (db.query.solution.findMany as any).mockResolvedValueOnce([]);

      const caller = createCaller({ session: null, apiKey: null });
      await caller.solutions.search({ query: "test", limit: 5 });
      expect(db.query.solution.findMany).toHaveBeenCalled();
    });

    test("rejects limit above 20", async () => {
      const caller = createCaller({ session: null, apiKey: null });
      await expect(
        caller.solutions.search({ query: "test", limit: 50 })
      ).rejects.toThrow();
    });
  });

  // ─── list ───

  describe("list", () => {
    test("returns recent solutions", async () => {
      (db.query.solution.findMany as any).mockResolvedValueOnce([
        { id: "sol_1", problem: "P1", solution: "S1", score: 5 },
        { id: "sol_2", problem: "P2", solution: "S2", score: 3 },
      ]);

      const caller = createCaller({ session: null, apiKey: null });
      const result = await caller.solutions.list({ limit: 10 });
      expect(result).toHaveLength(2);
    });

    test("uses default limit of 20", async () => {
      (db.query.solution.findMany as any).mockResolvedValueOnce([]);

      const caller = createCaller({ session: null, apiKey: null });
      await caller.solutions.list({});
      expect(db.query.solution.findMany).toHaveBeenCalled();
    });

    test("does not require authentication", async () => {
      (db.query.solution.findMany as any).mockResolvedValueOnce([]);

      const caller = createCaller({ session: null, apiKey: null });
      const result = await caller.solutions.list({});
      expect(result).toEqual([]);
    });
  });

  // ─── getById ───

  describe("getById", () => {
    test("returns solution when found", async () => {
      (db.query.solution.findFirst as any).mockResolvedValueOnce({
        id: "sol_1",
        problem: "Test",
        solution: "Answer",
        score: 0,
      });

      const caller = createCaller({ session: null, apiKey: null });
      const result = await caller.solutions.getById({ id: "sol_1" });
      expect(result.problem).toBe("Test");
    });

    test("throws NOT_FOUND when solution does not exist", async () => {
      (db.query.solution.findFirst as any).mockResolvedValueOnce(undefined);

      const caller = createCaller({ session: null, apiKey: null });
      await expect(
        caller.solutions.getById({ id: "nonexistent" })
      ).rejects.toThrow("Solution not found");
    });
  });

  // ─── log ───

  describe("log", () => {
    test("rejects unauthenticated requests", async () => {
      const caller = createCaller({ session: null, apiKey: null });
      await expect(
        caller.solutions.log({
          problem: "test problem",
          solution: "test solution",
        })
      ).rejects.toThrow("You must be logged in or provide a valid API key to log solutions");
    });

    test("succeeds with session authentication", async () => {
      const caller = createCaller({ session: mockSession, apiKey: null });
      const result = await caller.solutions.log({
        problem: "Deploy fails",
        solution: "Check env vars",
        tags: "deploy,ci",
      });

      expect(result).toHaveProperty("id");
      expect(db.insert).toHaveBeenCalled();
    });

    test("succeeds with valid API key", async () => {
      (auth.api.verifyApiKey as any).mockResolvedValueOnce({
        valid: true,
        error: null,
        key: { referenceId: "user_42" },
      });

      const caller = createCaller({ session: null, apiKey: "clk_test_key" });
      const result = await caller.solutions.log({
        problem: "Build error",
        solution: "Update dependencies",
      });

      expect(result).toHaveProperty("id");
      expect(auth.api.verifyApiKey).toHaveBeenCalledWith({
        body: { key: "clk_test_key" },
      });
    });

    test("rejects invalid API key", async () => {
      (auth.api.verifyApiKey as any).mockResolvedValueOnce({
        valid: false,
        error: { message: "INVALID_API_KEY", code: "INVALID_API_KEY" },
        key: null,
      });

      const caller = createCaller({ session: null, apiKey: "clk_bad_key" });
      await expect(
        caller.solutions.log({
          problem: "test",
          solution: "test",
        })
      ).rejects.toThrow();
    });

    test("validates empty problem string", async () => {
      const caller = createCaller({ session: mockSession, apiKey: null });
      await expect(
        caller.solutions.log({ problem: "", solution: "test" })
      ).rejects.toThrow();
    });

    test("validates empty solution string", async () => {
      const caller = createCaller({ session: mockSession, apiKey: null });
      await expect(
        caller.solutions.log({ problem: "test", solution: "" })
      ).rejects.toThrow();
    });

    test("tags are optional", async () => {
      const caller = createCaller({ session: mockSession, apiKey: null });
      const result = await caller.solutions.log({
        problem: "No tags",
        solution: "Still works",
      });
      expect(result).toHaveProperty("id");
    });
  });

  // ─── vote ───

  describe("vote", () => {
    test("rejects unauthenticated requests", async () => {
      const caller = createCaller({ session: null, apiKey: null });
      await expect(
        caller.solutions.vote({ id: "sol_1", isUpvote: true })
      ).rejects.toThrow("You must be logged in or provide a valid API key to vote");
    });

    test("throws NOT_FOUND for missing solution", async () => {
      (db.query.solution.findFirst as any).mockResolvedValueOnce(undefined);

      const caller = createCaller({ session: mockSession, apiKey: null });
      await expect(
        caller.solutions.vote({ id: "nonexistent", isUpvote: true })
      ).rejects.toThrow("Solution not found");
    });

    test("creates a new upvote when no existing vote", async () => {
      (db.query.solution.findFirst as any).mockResolvedValueOnce({ id: "sol_1" });
      (db.query.solutionVote.findFirst as any).mockResolvedValueOnce(undefined);

      const caller = createCaller({ session: mockSession, apiKey: null });
      const result = await caller.solutions.vote({ id: "sol_1", isUpvote: true });

      expect(result).toEqual({ success: true });
      expect(db.insert).toHaveBeenCalled();
    });

    test("creates a new downvote when no existing vote", async () => {
      (db.query.solution.findFirst as any).mockResolvedValueOnce({ id: "sol_1" });
      (db.query.solutionVote.findFirst as any).mockResolvedValueOnce(undefined);

      const caller = createCaller({ session: mockSession, apiKey: null });
      const result = await caller.solutions.vote({ id: "sol_1", isUpvote: false });

      expect(result).toEqual({ success: true });
      expect(db.insert).toHaveBeenCalled();
    });

    test("toggles off vote when same direction", async () => {
      (db.query.solution.findFirst as any).mockResolvedValueOnce({ id: "sol_1" });
      (db.query.solutionVote.findFirst as any).mockResolvedValueOnce({
        userId: "user_1",
        solutionId: "sol_1",
        isUpvote: true,
      });

      const caller = createCaller({ session: mockSession, apiKey: null });
      const result = await caller.solutions.vote({ id: "sol_1", isUpvote: true });

      expect(result).toEqual({ success: true });
      expect(db.delete).toHaveBeenCalled();
    });

    test("flips vote when opposite direction", async () => {
      (db.query.solution.findFirst as any).mockResolvedValueOnce({ id: "sol_1" });
      (db.query.solutionVote.findFirst as any).mockResolvedValueOnce({
        userId: "user_1",
        solutionId: "sol_1",
        isUpvote: true,
      });

      const caller = createCaller({ session: mockSession, apiKey: null });
      const result = await caller.solutions.vote({ id: "sol_1", isUpvote: false });

      expect(result).toEqual({ success: true });
      expect(db.update).toHaveBeenCalled();
    });

    test("works with API key authentication", async () => {
      (auth.api.verifyApiKey as any).mockResolvedValueOnce({
        valid: true,
        error: null,
        key: { referenceId: "user_99" },
      });
      (db.query.solution.findFirst as any).mockResolvedValueOnce({ id: "sol_1" });
      (db.query.solutionVote.findFirst as any).mockResolvedValueOnce(undefined);

      const caller = createCaller({ session: null, apiKey: "clk_valid_key" });
      const result = await caller.solutions.vote({ id: "sol_1", isUpvote: true });

      expect(result).toEqual({ success: true });
    });

    test("validates empty solution ID", async () => {
      const caller = createCaller({ session: mockSession, apiKey: null });
      await expect(
        caller.solutions.vote({ id: "", isUpvote: true })
      ).rejects.toThrow();
    });

    test("recomputes score after vote", async () => {
      (db.query.solution.findFirst as any).mockResolvedValueOnce({ id: "sol_1" });
      (db.query.solutionVote.findFirst as any).mockResolvedValueOnce(undefined);

      const caller = createCaller({ session: mockSession, apiKey: null });
      await caller.solutions.vote({ id: "sol_1", isUpvote: true });

      expect(db.select).toHaveBeenCalled();
    });
  });
});
