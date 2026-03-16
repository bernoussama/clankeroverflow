import { describe, expect, test } from "bun:test";
import { appRouter } from "./index";
import { t } from "../index";

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

describe("appRouter", () => {
  test("healthCheck returns OK", async () => {
    const caller = createCaller({ session: null, apiKey: null });
    const result = await caller.healthCheck();
    expect(result).toBe("OK");
  });

  test("privateData rejects unauthenticated requests", async () => {
    const caller = createCaller({ session: null, apiKey: null });
    await expect(caller.privateData()).rejects.toThrow("Authentication required");
  });

  test("privateData returns user data when authenticated", async () => {
    const caller = createCaller({ session: mockSession, apiKey: null });
    const result = await caller.privateData();
    expect(result.message).toBe("This is private");
    expect(result.user?.email).toBe("test@example.com");
  });

  test("solutions router is mounted", async () => {
    const caller = createCaller({ session: null, apiKey: null });
    expect(caller.solutions).toBeDefined();
    expect(caller.solutions.search).toBeDefined();
    expect(caller.solutions.list).toBeDefined();
    expect(caller.solutions.getById).toBeDefined();
    expect(caller.solutions.log).toBeDefined();
    expect(caller.solutions.vote).toBeDefined();
  });
});
