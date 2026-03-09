import { describe, expect, test, mock, beforeEach } from "bun:test";
import { appRouter } from "./index";
import { t } from "../index";
import { db } from "@clankeroverflow/db";

const createCaller = t.createCallerFactory(appRouter);

describe("apiKeysRouter", () => {
  const mockSession = {
    session: {
      id: "sess_1",
      userId: "user_1",
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
  });

  test("list should return api keys for user", async () => {
    (db.query.apiKey.findMany as any).mockResolvedValueOnce([
      { id: "1", name: "Key 1", key: "clk_abc", userId: "user_1" }
    ]);
    
    const caller = createCaller({
      session: mockSession,
      apiKey: null,
    });
    
    const result = await caller.apiKeys.list();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Key 1");
  });

  test("create should require a name", async () => {
    const caller = createCaller({
      session: mockSession,
      apiKey: null,
    });
    
    expect(caller.apiKeys.create({ name: "" })).rejects.toThrow();
  });
});
