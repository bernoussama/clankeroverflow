import { beforeEach, describe, expect, test } from "bun:test";
import { appRouter } from "./index";
import { t } from "../index";
import { getDb } from "@clankeroverflow/db";

const createCaller = t.createCallerFactory(appRouter);
const db = getDb();

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
      updatedAt: new Date()
    },
    user: {
      id: "user_1",
      email: "test@example.com",
      name: "Test User",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
  };

  beforeEach(() => {
    (db.execute as any).mockClear();
    (db.query.solution.findFirst as any).mockClear();
  });

  test("search should return empty array if query is empty after trim", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    });
    
    const result = await caller.solutions.search({ query: "   " });
    expect(result).toEqual([]);
    expect((db.execute as any)).not.toHaveBeenCalled();
  });

  test("search should execute ranked search and return results", async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [
        { id: "sol_1", problem: "Test problem", solution: "Test solution", score: 0 }
      ],
    });
    
    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    });
    
    const result = await caller.solutions.search({ query: "Test" });
    expect(result).toHaveLength(1);
    expect(result[0]?.problem).toBe("Test problem");
  });

  test("getById should return solution if found", async () => {
    (db.query.solution.findFirst as any).mockResolvedValueOnce(
      { id: "sol_1", problem: "Test problem", solution: "Test solution", score: 0 }
    );
    
    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    });
    
    const result = await caller.solutions.getById({ id: "sol_1" });
    expect(result.problem).toBe("Test problem");
  });

  test("getById should throw NOT_FOUND if not found", async () => {
    (db.query.solution.findFirst as any).mockResolvedValueOnce(undefined);
    
    const caller = createCaller({
      auth: null as any,
      db,
      session: null,
      apiKey: null,
    });
    
    expect(caller.solutions.getById({ id: "sol_1" })).rejects.toThrow("Solution not found");
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
});
