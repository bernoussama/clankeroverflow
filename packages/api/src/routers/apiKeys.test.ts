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
      {
        id: "1",
        name: "Key 1",
        key: "7dacf9c63bcfb108c2e298e9a53c0e75681866d5041a73cba714cf250ce6a212",
        keyPreview: "clk_abcd...1234",
        userId: "user_1",
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
      }
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
    expect(result[0]?.keyPreview).toBe("clk_abcd...1234");
    expect(result[0]).not.toHaveProperty("key");
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

  test("create should hash the persisted api key and only return the raw secret once", async () => {
    const createdAt = new Date("2026-03-20T10:00:00.000Z");
    const values = mock(() => ({
      returning: mock().mockResolvedValueOnce([
        {
          id: "key_1",
          keyPreview: "clk_8f9b...4c2a",
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

    const insertedValues = values.mock.calls[0]?.[0];

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Local Agent",
        userId: "user_1",
        key: expect.any(String),
        keyPreview: expect.any(String),
      })
    );
    expect(insertedValues?.key).toMatch(/^[a-f0-9]{64}$/);
    expect(insertedValues?.keyPreview).toBe(`${result.key.slice(0, 8)}...${result.key.slice(-4)}`);
    expect(insertedValues?.key).not.toBe(result.key);
    expect(result).toEqual({
      id: "key_1",
      key: expect.stringMatching(/^clk_[a-f0-9]+$/),
      keyPreview: `${result.key.slice(0, 8)}...${result.key.slice(-4)}`,
      name: "Local Agent",
      createdAt,
    });
  });
});
