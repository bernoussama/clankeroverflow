import { describe, expect, test } from "vitest";
import { appRouter } from "./index";
import { t } from "../index";

const createCaller = t.createCallerFactory(appRouter);

describe("appRouter", () => {
  test("healthCheck should return OK", async () => {
    const caller = createCaller({
      session: null,
      apiKey: null,
    });
    const result = await caller.healthCheck();
    expect(result).toBe("OK");
  });

  test("apiKeyCheck should report whether the request has a verified API key", async () => {
    const anonymousCaller = createCaller({
      session: null,
      apiKey: null,
    } as never);
    const apiKeyCaller = createCaller({
      session: null,
      apiKey: { referenceId: "user_1" },
    } as never);

    await expect(anonymousCaller.apiKeyCheck()).resolves.toBe(false);
    await expect(apiKeyCaller.apiKeyCheck()).resolves.toBe(true);
  });

  test("privateData should reject if not authenticated", async () => {
    const caller = createCaller({
      session: null,
      apiKey: null,
    });

    await expect(caller.privateData()).rejects.toThrow("Authentication required");
  });

  test("privateData should return data if authenticated", async () => {
    const caller = createCaller({
      session: {
        session: {
          id: "sess_1",
          userId: "user_1",
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
      },
      apiKey: null,
    });

    const result = await caller.privateData();
    expect(result.message).toBe("This is private");
    expect(result.user?.email).toBe("test@example.com");
  });
});
