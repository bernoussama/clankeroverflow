import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getDb } from "@clankeroverflow/db";
import { t } from "../index";
import { appRouter } from "./index";

const createCaller = t.createCallerFactory(appRouter);
const db = getDb();

function createSelectChain(result: unknown[]) {
  const chain: any = {};
  chain.from = mock(() => chain);
  chain.where = mock(() => chain);
  chain.orderBy = mock(() => chain);
  chain.limit = mock(() => result);
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
    (db.execute as any).mockClear?.();
    (db.query.solution.findFirst as any).mockClear?.();
    (db.query.solutionVote.findFirst as any).mockClear?.();
    (db.select as any).mockClear?.();
    (db.insert as any).mockClear?.();
    (db.update as any).mockClear?.();
    (db.delete as any).mockClear?.();
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

    const result = await caller.solutions.search({ query: "Test" });
    expect(result).toHaveLength(1);
    expect(result[0]?.problem).toBe("Test problem");
  });

  test("getById should return solution with vote counts", async () => {
    (db.query.solution.findFirst as any).mockResolvedValueOnce({
      id: "sol_1",
      problem: "Test problem",
      solution: "Test solution",
      score: 0,
    });
    (db.select as any).mockReturnValueOnce({
      from: mock(() => ({
        where: mock(() => [{ upvotes: 3, downvotes: 1 }]),
      })),
    });

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
    (db.query.solution.findFirst as any).mockResolvedValueOnce({
      id: "sol_1",
      problem: "Test problem",
      solution: "Test solution",
      score: 0,
    });
    (db.select as any).mockReturnValueOnce({
      from: mock(() => ({
        where: mock(() => [{ upvotes: 5, downvotes: 2 }]),
      })),
    });
    (db.query.solutionVote.findFirst as any).mockResolvedValueOnce({
      userId: "user_1",
      solutionId: "sol_1",
      isUpvote: true,
    });

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

  test("getById should throw NOT_FOUND if not found", async () => {
    (db.query.solution.findFirst as any).mockResolvedValueOnce(undefined);

    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    expect(caller.solutions.getById({ id: "sol_1" })).rejects.toThrow("Solution not found");
  });

  test("vote should reject unauthenticated users", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    } as any);

    expect(
      caller.solutions.vote({ id: "sol_1", isUpvote: true }),
    ).rejects.toThrow("You must be logged in or provide a valid API key to vote");
  });

  test("vote should reject if solution not found", async () => {
    (db.query.solution.findFirst as any).mockResolvedValueOnce(undefined);

    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
    } as any);

    expect(
      caller.solutions.vote({ id: "sol_nonexistent", isUpvote: true }),
    ).rejects.toThrow("Solution not found");
  });

  test("vote should insert new upvote for authenticated user", async () => {
    (db.query.solution.findFirst as any).mockResolvedValueOnce({
      id: "sol_1",
      problem: "Test",
      solution: "Test",
      score: 0,
    });
    (db.query.solutionVote.findFirst as any).mockResolvedValueOnce(undefined);

    (db.select as any).mockReturnValueOnce({
      from: mock(() => ({
        where: mock(() => [{ upvotes: 1, downvotes: 0 }]),
      })),
    });

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

  test("vote should toggle off existing same-direction vote", async () => {
    (db.query.solution.findFirst as any).mockResolvedValueOnce({
      id: "sol_1",
      problem: "Test",
      solution: "Test",
      score: 1,
    });
    (db.query.solutionVote.findFirst as any).mockResolvedValueOnce({
      userId: "user_1",
      solutionId: "sol_1",
      isUpvote: true,
    });

    (db.select as any).mockReturnValueOnce({
      from: mock(() => ({
        where: mock(() => [{ upvotes: 0, downvotes: 0 }]),
      })),
    });

    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
    } as any);

    const result = await caller.solutions.vote({ id: "sol_1", isUpvote: true });
    expect(result.success).toBe(true);
    expect(db.delete as any).toHaveBeenCalled();
  });

  test("vote should flip existing opposite-direction vote", async () => {
    (db.query.solution.findFirst as any).mockResolvedValueOnce({
      id: "sol_1",
      problem: "Test",
      solution: "Test",
      score: -1,
    });
    (db.query.solutionVote.findFirst as any).mockResolvedValueOnce({
      userId: "user_1",
      solutionId: "sol_1",
      isUpvote: false,
    });

    (db.select as any).mockReturnValueOnce({
      from: mock(() => ({
        where: mock(() => [{ upvotes: 1, downvotes: 0 }]),
      })),
    });

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
    (db.query.solution.findFirst as any).mockResolvedValueOnce({
      id: "sol_1",
      problem: "Test",
      solution: "Test",
      score: 0,
    });
    (db.query.solutionVote.findFirst as any).mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const caller = createCaller({
      db,
      session: mockSession,
      apiKey: null,
    } as any);

    try {
      await caller.solutions.vote({ id: "sol_1", isUpvote: true });
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e.code).toBe("INTERNAL_SERVER_ERROR");
      expect(e.message).toBe("Failed to record vote");
    }
  });

  test("log should reject oversized payloads", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
    });

    expect(
      caller.solutions.log({
        problem: "p".repeat(301),
        solution: "s",
      }),
    ).rejects.toThrow();

    expect(
      caller.solutions.log({
        problem: "p",
        solution: "s".repeat(30_001),
      }),
    ).rejects.toThrow();
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
    expect(result.nextCursor).toEqual({
      createdAt: items[5]?.createdAt.toISOString(),
      id: items[5]?.id,
      score: items[5]?.score,
    });
  });
});
