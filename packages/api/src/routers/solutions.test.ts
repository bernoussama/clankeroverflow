import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "@clankeroverflow/db";
import { t } from "../index";
import { resetRateLimits } from "../rate-limit";
import { appRouter } from "./index";

const createCaller = t.createCallerFactory(appRouter);
const db = getDb();
const solutionsSource = readFileSync(
  fileURLToPath(new URL("./solutions.ts", import.meta.url)),
  "utf8",
);

function createSelectChain(result: unknown[]) {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => result);
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  chain[Symbol.iterator] = () => result[Symbol.iterator]();
  return chain;
}

describe("solutionsRouter", () => {
  const mockSession = {
    session: {
      id: "sess_1",
      userId: "user_1",
      token: "token_1",
      expiresAt: new Date(),
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

  beforeEach(() => {
    resetRateLimits();
    (db.execute as any).mockClear?.();
    (db.select as any).mockClear?.();
    (db.insert as any).mockClear?.();
    (db.update as any).mockClear?.();
    (db.delete as any).mockClear?.();
  });

  test("uses the verified Better Auth api key reference instead of hashing and querying the key table", () => {
    expect(solutionsSource).toContain("ctx.apiKey?.referenceId");
    expect(solutionsSource).toContain("getAuthenticatedUserId(ctx)");
    expect(solutionsSource).not.toContain("hashApiKey");
    expect(solutionsSource).not.toContain("schema.apiKey");
  });

  test("search should return empty array if query is empty after trim", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    const result = await caller.solutions.search({ query: "   " });
    expect(result).toEqual([]);
    expect(db.execute as any).not.toHaveBeenCalled();
  });

  test("search should execute ranked search and return results", async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [{ id: "sol_1", problem: "Test problem", solution: "Test solution", score: 0 }],
    });

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    const result = await caller.solutions.search({ query: "Test", mode: "keyword" });
    expect(result).toHaveLength(1);
    expect(result[0]?.problem).toBe("Test problem");
  });

  test("search should capture analytics through the request context", async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [{ id: "sol_1", problem: "Test problem", solution: "Test solution", score: 0 }],
    });
    const capture = vi.fn();

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
      posthog: { capture },
    } as any);

    await caller.solutions.search({ query: "Test", mode: "keyword" });

    expect(capture).toHaveBeenCalledWith({
      distinctId: "anonymous",
      event: "solution searched",
      properties: {
        search_mode: "keyword",
        query_length: 4,
        result_count: 1,
      },
    });
  });

  test("search should enrich the request wide event with business context", async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [{ id: "sol_1", problem: "Test problem", solution: "Test solution", score: 0 }],
    });
    const requestLog: Record<string, unknown> = {};

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
      requestLog,
    } as any);

    await caller.solutions.search({ query: " Test ", mode: "keyword", limit: 5 });

    expect(requestLog).toMatchObject({
      trpc_procedure: "solutions.search",
      search_mode: "keyword",
      query_length: 4,
      result_count: 1,
      user_type: "anonymous",
    });
    expect(JSON.stringify(requestLog)).not.toContain("Test problem");
    expect(JSON.stringify(requestLog)).not.toContain("Test solution");
  });

  test("search should rate limit anonymous keyword requests by request identity", async () => {
    (db.execute as any).mockResolvedValue({ rows: [] });

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
      requestIdentity: "ip:203.0.113.10",
    } as any);

    for (let i = 0; i < 60; i++) {
      await caller.solutions.search({ query: `Test ${i}`, mode: "keyword" });
    }

    await expect(
      caller.solutions.search({ query: "Test overflow", mode: "keyword" }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  test("search semantic without authentication returns UNAUTHORIZED", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    await expect(caller.solutions.search({ query: "x", mode: "semantic" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("search semantic without AI binding returns PRECONDITION_FAILED when authenticated", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
      ai: null,
      solutionVectors: null,
    } as any);

    await expect(caller.solutions.search({ query: "x", mode: "semantic" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  test("search semantic should return results in vector match order when AI bindings are present", async () => {
    (db.select as any).mockReturnValueOnce(
      createSelectChain([
        { id: "sol_b", problem: "Problem B", solution: "Solution B", score: 0 },
        { id: "sol_a", problem: "Problem A", solution: "Solution A", score: 0 },
      ]),
    );

    const ai = {
      run: vi.fn(async () => ({ data: [[0.1]] })),
    };
    const solutionVectors = {
      query: vi.fn(async () => ({
        matches: [
          { id: "sol_a", score: 0.9 },
          { id: "sol_b", score: 0.6 },
        ],
      })),
    };

    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
      ai,
      solutionVectors,
    } as any);

    const result = await caller.solutions.search({ query: "Test", mode: "semantic", limit: 2 });

    expect(result.map((row) => row.id)).toEqual(["sol_a", "sol_b"]);
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(solutionVectors.query).toHaveBeenCalledTimes(1);
  });

  test("search hybrid should prioritize semantic matches before remaining keyword matches", async () => {
    (db.select as any).mockReturnValueOnce(
      createSelectChain([
        { id: "sol_a", problem: "Problem A", solution: "Solution A", score: 0 },
        { id: "sol_b", problem: "Problem B", solution: "Solution B", score: 0 },
      ]),
    );
    (db.execute as any).mockResolvedValueOnce({
      rows: [
        { id: "sol_c", problem: "Problem C", solution: "Solution C", score: 0 },
        { id: "sol_a", problem: "Problem A", solution: "Solution A", score: 0 },
      ],
    });

    const ai = {
      run: vi.fn(async () => ({ data: [[0.1]] })),
    };
    const solutionVectors = {
      query: vi.fn(async () => ({
        matches: [
          { id: "sol_b", score: 0.95 },
          { id: "sol_a", score: 0.8 },
        ],
      })),
    };

    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
      ai,
      solutionVectors,
    } as any);

    const result = await caller.solutions.search({ query: "Test", mode: "hybrid", limit: 3 });

    expect(result.map((row) => row.id)).toEqual(["sol_b", "sol_a", "sol_c"]);
    expect(db.execute as any).toHaveBeenCalledTimes(1);
  });

  test("search should rate limit authenticated semantic requests", async () => {
    (db.select as any).mockReturnValue(createSelectChain([]));

    const ai = {
      run: vi.fn(async () => ({ data: [[0.1]] })),
    };
    const solutionVectors = {
      query: vi.fn(async () => ({ matches: [] })),
    };

    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
      ai,
      solutionVectors,
      requestIdentity: "ip:203.0.113.11",
    } as any);

    for (let i = 0; i < 60; i++) {
      await caller.solutions.search({ query: `Test ${i}`, mode: "semantic" });
    }

    await expect(
      caller.solutions.search({ query: "Test overflow", mode: "semantic" }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  test("getById should return solution with vote counts", async () => {
    (db.select as any)
      .mockReturnValueOnce(
        createSelectChain([
          { id: "sol_1", problem: "Test problem", solution: "Test solution", score: 0 },
        ]),
      )
      .mockReturnValueOnce(createSelectChain([{ upvotes: 3, downvotes: 1 }]));

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    const result = await caller.solutions.getById({ id: "sol_1" });
    expect(result.problem).toBe("Test problem");
    expect(result.upvotes).toBe(3);
    expect(result.downvotes).toBe(1);
    expect(result.userVote).toBeNull();
  });

  test("getById should return userVote when session is present", async () => {
    (db.select as any)
      .mockReturnValueOnce(
        createSelectChain([
          { id: "sol_1", problem: "Test problem", solution: "Test solution", score: 0 },
        ]),
      )
      .mockReturnValueOnce(createSelectChain([{ upvotes: 5, downvotes: 2 }]))
      .mockReturnValueOnce(createSelectChain([{ isUpvote: true }]));

    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
    } as any);

    const result = await caller.solutions.getById({ id: "sol_1" });
    expect(result.upvotes).toBe(5);
    expect(result.downvotes).toBe(2);
    expect(result.userVote).toBe(true);
  });

  test("getById should return userVote when api key authentication is present", async () => {
    (db.select as any)
      .mockReturnValueOnce(
        createSelectChain([
          { id: "sol_1", problem: "Test problem", solution: "Test solution", score: 0 },
        ]),
      )
      .mockReturnValueOnce(createSelectChain([{ upvotes: 5, downvotes: 2 }]))
      .mockReturnValueOnce(createSelectChain([{ isUpvote: true }]));

    const caller = createCaller({
      db,
      session: null,
      apiKey: { referenceId: "user_1" },
    } as any);

    const result = await caller.solutions.getById({ id: "sol_1" });
    expect(result.userVote).toBe(true);
  });

  test("getById should throw NOT_FOUND if not found", async () => {
    (db.select as any).mockReturnValueOnce(createSelectChain([]));

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    await expect(caller.solutions.getById({ id: "sol_1" })).rejects.toThrow("Solution not found");
  });

  test("vote should reject unauthenticated users", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    await expect(caller.solutions.vote({ id: "sol_1", isUpvote: true })).rejects.toThrow(
      "You must be logged in or provide a valid API key to vote",
    );
  });

  test("vote should reject if solution not found", async () => {
    (db.select as any).mockReturnValueOnce(createSelectChain([]));

    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
    } as any);

    await expect(caller.solutions.vote({ id: "sol_nonexistent", isUpvote: true })).rejects.toThrow(
      "Solution not found",
    );
  });

  test("vote should insert new upvote for authenticated user", async () => {
    (db.select as any)
      .mockReturnValueOnce(
        createSelectChain([{ id: "sol_1", problem: "Test", solution: "Test", score: 0 }]),
      )
      .mockReturnValueOnce(createSelectChain([]))
      .mockReturnValueOnce(createSelectChain([{ score: 1 }]))
      .mockReturnValueOnce(createSelectChain([{ upvotes: 1, downvotes: 0 }]));

    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
    } as any);

    const result = await caller.solutions.vote({ id: "sol_1", isUpvote: true });
    expect(result.success).toBe(true);
    expect(result.upvotes).toBe(1);
    expect(result.downvotes).toBe(0);

    expect(db.insert as any).toHaveBeenCalled();
  });

  test("vote should still succeed if analytics capture fails after the write", async () => {
    (db.select as any)
      .mockReturnValueOnce(
        createSelectChain([{ id: "sol_1", problem: "Test", solution: "Test", score: 0 }]),
      )
      .mockReturnValueOnce(createSelectChain([]))
      .mockReturnValueOnce(createSelectChain([{ score: 1 }]))
      .mockReturnValueOnce(createSelectChain([{ upvotes: 1, downvotes: 0 }]));
    const requestLog: Record<string, unknown> = {};
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
      requestLog,
      posthog: {
        capture: vi.fn(() => {
          throw new Error("analytics unavailable");
        }),
      },
    } as any);

    const result = await caller.solutions.vote({ id: "sol_1", isUpvote: true });

    expect(result.success).toBe(true);
    expect(result.upvotes).toBe(1);
    expect(result.downvotes).toBe(0);
    expect(requestLog).toMatchObject({
      analytics_capture_failed: true,
      analytics_event: "solution voted",
      error_type: "Error",
      error_message: "analytics unavailable",
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("vote should recover when insert reports failure after the vote was committed", async () => {
    (db.select as any)
      .mockReturnValueOnce(
        createSelectChain([{ id: "sol_1", problem: "Test", solution: "Test", score: 0 }]),
      )
      .mockReturnValueOnce(createSelectChain([]))
      .mockReturnValueOnce(createSelectChain([{ isUpvote: true }]))
      .mockReturnValueOnce(createSelectChain([{ score: 1 }]))
      .mockReturnValueOnce(createSelectChain([{ upvotes: 1, downvotes: 0 }]))
      .mockReturnValueOnce(createSelectChain([{ isUpvote: true }]));
    (db.insert as any).mockReturnValueOnce({
      values: vi.fn(() => Promise.reject(new Error("connection closed after commit"))),
    });
    const requestLog: Record<string, unknown> = {};

    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
      requestLog,
    } as any);

    const result = await caller.solutions.vote({ id: "sol_1", isUpvote: true });

    expect(result).toMatchObject({
      success: true,
      upvotes: 1,
      downvotes: 0,
      userVote: true,
    });
    expect(db.update as any).toHaveBeenCalled();
    expect(requestLog).toMatchObject({
      vote_insert_recovered: true,
      error_type: "Error",
      error_message: "connection closed after commit",
    });
  });

  test("vote should toggle off existing same-direction vote", async () => {
    (db.select as any)
      .mockReturnValueOnce(
        createSelectChain([{ id: "sol_1", problem: "Test", solution: "Test", score: 1 }]),
      )
      .mockReturnValueOnce(
        createSelectChain([{ userId: "user_1", solutionId: "sol_1", isUpvote: true }]),
      )
      .mockReturnValueOnce(createSelectChain([{ score: 0 }]))
      .mockReturnValueOnce(createSelectChain([{ upvotes: 0, downvotes: 0 }]))
      .mockReturnValueOnce(createSelectChain([]));

    const requestLog: Record<string, unknown> = {};
    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
      requestLog,
    } as any);

    const result = await caller.solutions.vote({ id: "sol_1", isUpvote: true });
    expect(result.success).toBe(true);
    expect(result.userVote).toBeNull();
    expect(db.delete as any).toHaveBeenCalled();
  });

  test("vote should flip existing opposite-direction vote", async () => {
    (db.select as any)
      .mockReturnValueOnce(
        createSelectChain([{ id: "sol_1", problem: "Test", solution: "Test", score: -1 }]),
      )
      .mockReturnValueOnce(
        createSelectChain([{ userId: "user_1", solutionId: "sol_1", isUpvote: false }]),
      )
      .mockReturnValueOnce(createSelectChain([{ score: 1 }]))
      .mockReturnValueOnce(createSelectChain([{ upvotes: 1, downvotes: 0 }]));

    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
    } as any);

    const result = await caller.solutions.vote({ id: "sol_1", isUpvote: true });
    expect(result.success).toBe(true);
    expect(db.update as any).toHaveBeenCalled();
  });

  test("vote should wrap DB errors as INTERNAL_SERVER_ERROR", async () => {
    const errorChain: any = {};
    errorChain.from = vi.fn(() => errorChain);
    errorChain.where = vi.fn(() => errorChain);
    errorChain.orderBy = vi.fn(() => errorChain);
    errorChain.limit = vi.fn(() => {
      throw new Error("connection refused");
    });

    (db.select as any)
      .mockReturnValueOnce(
        createSelectChain([{ id: "sol_1", problem: "Test", solution: "Test", score: 0 }]),
      )
      .mockReturnValueOnce(errorChain);

    const requestLog: Record<string, unknown> = {};
    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
      requestLog,
    } as any);

    try {
      await caller.solutions.vote({ id: "sol_1", isUpvote: true });
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e.code).toBe("INTERNAL_SERVER_ERROR");
      expect(e.message).toBe("Failed to record vote (existing-vote-lookup)");
      expect(requestLog).toMatchObject({
        failure_step: "existing-vote-lookup",
        error_type: "Error",
        error_message: "connection refused",
      });
    }
  });

  test("log should reject oversized payloads", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
    });

    await expect(
      caller.solutions.log({
        problem: "p".repeat(301),
        solution: "s",
      }),
    ).rejects.toThrow();

    await expect(
      caller.solutions.log({
        problem: "p",
        solution: "s".repeat(30_001),
      }),
    ).rejects.toThrow();
  });

  test("log should reject project-specific audit summaries", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
    });

    await expect(
      caller.solutions.log({
        problem: "DeepSec security audit: 10 findings across CLI, API, MCP, web, and DB layers",
        solution:
          "Fixed all 10 findings. BUG FIXES: changed packages/api/src/routers/solutions.ts and updated CLANKER_WEB_URL. SECURITY FIXES: scoped the API key cache leak.",
        tags: "security,deepsec,clankeroverflow",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(db.insert as any).not.toHaveBeenCalled();
  });

  test("log should reject release-note style multi-finding summaries", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
    });

    await expect(
      caller.solutions.log({
        problem: "Security audit found 7 findings in the service",
        solution:
          "Fixed all 7 issues. BUG FIXES: pagination, voting, cache leaks. SECURITY FIXES: auth and prompt injection hardening.",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(db.insert as any).not.toHaveBeenCalled();
  });

  test("log should rate limit anonymous submissions before vector indexing", async () => {
    const waitUntil = vi.fn();
    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
      ai: { run: vi.fn(async () => ({ data: [Array(768).fill(0.1)] })) },
      solutionVectors: { upsert: vi.fn(async () => undefined) },
      waitUntil,
      requestIdentity: "ip:203.0.113.12",
    } as any);

    for (let i = 0; i < 10; i++) {
      await caller.solutions.log({
        problem: `Problem ${i}`,
        solution: "Solution",
      });
    }

    await expect(
      caller.solutions.log({
        problem: "Problem overflow",
        solution: "Solution",
      }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(waitUntil).toHaveBeenCalledTimes(10);
  });

  test("list should return items and no nextCursor when fewer than limit", async () => {
    const items = [
      { id: "sol_1", problem: "P1", solution: "S1", score: 5, createdAt: new Date() },
      { id: "sol_2", problem: "P2", solution: "S2", score: 3, createdAt: new Date() },
    ];
    (db.select as any).mockReturnValueOnce(createSelectChain(items));

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    const result = await caller.solutions.list({ limit: 20, sort: "recent" });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  test("list should capture analytics with the returned item count", async () => {
    const items = [
      { id: "sol_1", problem: "P1", solution: "S1", score: 5, createdAt: new Date() },
      { id: "sol_2", problem: "P2", solution: "S2", score: 3, createdAt: new Date() },
    ];
    (db.select as any).mockReturnValueOnce(createSelectChain(items));
    const capture = vi.fn();

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
      posthog: { capture },
    } as any);

    await caller.solutions.list({ limit: 20, sort: "recent" });

    expect(capture).toHaveBeenCalledWith({
      distinctId: "anonymous",
      event: "solution list viewed",
      properties: {
        sort: "recent",
        result_count: 2,
        is_paginated: false,
      },
    });
  });

  test("list should return nextCursor when more items exist for top sorting", async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `sol_${i}`,
      problem: `P${i}`,
      solution: `S${i}`,
      score: i,
      createdAt: new Date(Date.now() - i * 60_000),
    }));
    (db.select as any).mockReturnValueOnce(createSelectChain(items));

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    const result = await caller.solutions.list({ limit: 5, sort: "top" });
    expect(result.items).toHaveLength(5);
    // Cursor now comes from the last *returned* row (index 4), not the extra row (index 5)
    expect(result.nextCursor).toEqual({
      createdAt: items[4]?.createdAt.toISOString(),
      id: items[4]?.id,
      score: items[4]?.score,
    });
  });

  test("list cursor should not skip solutions between pages", async () => {
    // Verify cursor points to last returned row so no item is skipped
    const allItems = Array.from({ length: 7 }, (_, i) => ({
      id: `sol_${i}`,
      problem: `P${i}`,
      solution: `S${i}`,
      score: 7 - i,
      createdAt: new Date(Date.now() - i * 60_000),
    }));

    // Page 1 mock: 4 rows = limit(3) + 1 extra
    (db.select as any).mockReturnValueOnce(createSelectChain(allItems.slice(0, 4)));

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    const page1 = await caller.solutions.list({ limit: 3, sort: "top" });
    expect(page1.items).toHaveLength(3);
    expect(page1.items.map((item) => item.id)).toEqual(["sol_0", "sol_1", "sol_2"]);

    // Cursor should point to last returned item (sol_2), not the extra item (sol_3)
    // This ensures sol_3 is included on the next page, not skipped
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.nextCursor!.id).toBe("sol_2");
  });
});
