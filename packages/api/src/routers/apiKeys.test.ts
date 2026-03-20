import { describe, expect, test, mock, beforeEach } from "bun:test";
import { appRouter } from "./index";
import { t } from "../index";
import { getDb } from "@clankeroverflow/db";

const createCaller = t.createCallerFactory(appRouter);
const db = getDb();

describe("apiKeysRouter", () => {
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
    (db.query.apiKey.findMany as any).mockClear();
    (db.query.apiKey.findFirst as any).mockClear();
    (db.insert as any).mockClear();
  });

  test("list should return api keys for user", async () => {
    (db.query.apiKey.findMany as any).mockResolvedValueOnce([
      { id: "1", name: "Key 1", key: "clk_abc", userId: "user_1" }
    ]);
    
    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
    });
    
    const result = await caller.apiKeys.list();
    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
    expect(result[0]?.name).toBe("Key 1");
  });

  test("create should require a name", async () => {
    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
    });
    
    expect(caller.apiKeys.create({ name: "" })).rejects.toThrow();
  });

  test("create should return the persisted api key for the current user", async () => {
    const createdAt = new Date("2026-03-20T10:00:00.000Z");
    const values = mock(() => ({
      returning: mock().mockResolvedValueOnce([
        {
          id: "key_1",
          key: "clk_1234567890",
          name: "Local Agent",
          createdAt,
        },
      ]),
    }));

    (db.insert as any).mockReturnValueOnce({ values });

    const caller = createCaller({
      auth: null as any,
      db,
      session: mockSession,
      apiKey: null,
    });

    const result = await caller.apiKeys.create({ name: "Local Agent" });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Local Agent",
        userId: "user_1",
      })
    );
    expect(result).toEqual({
      id: "key_1",
      key: "clk_1234567890",
      name: "Local Agent",
      createdAt,
    });
  });
});
