import { describe, expect, test } from "bun:test";
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

  test("privateData should reject if not authenticated", async () => {
    const caller = createCaller({
      session: null,
      apiKey: null,
    });

    expect(caller.privateData()).rejects.toThrow("Authentication required");
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
