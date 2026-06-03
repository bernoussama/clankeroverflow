import { describe, expect, test, vi } from "vitest";
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

  test("cliAuth.exchangeDeviceToken should create an API key from a valid bearer token", async () => {
    const getSession = vi.fn(async () => ({
      session: {
        id: "sess_1",
        userId: "user_1",
        expiresAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "CLI",
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
    }));
    const createApiKey = vi.fn(async () => ({
      id: "key_1",
      key: "clk_created",
      name: "CLI setup - laptop",
      start: "clk_crea",
      prefix: "clk_",
    }));
    const caller = createCaller({
      session: null,
      apiKey: null,
      auth: {
        api: {
          getSession,
          createApiKey,
        },
      },
    } as never);

    await expect(
      caller.cliAuth.exchangeDeviceToken({
        accessToken: "device-token",
        clientName: "CLI setup - laptop",
      }),
    ).resolves.toMatchObject({
      key: "clk_created",
      id: "key_1",
    });
    expect(getSession).toHaveBeenCalledWith({
      headers: {
        authorization: "Bearer device-token",
      },
    });
    expect(createApiKey).toHaveBeenCalledWith({
      body: {
        name: "CLI setup - laptop",
        userId: "user_1",
      },
    });
  });

  test("cliAuth.exchangeDeviceToken should reject an invalid bearer token", async () => {
    const caller = createCaller({
      session: null,
      apiKey: null,
      auth: {
        api: {
          getSession: vi.fn(async () => null),
        },
      },
    } as never);

    await expect(
      caller.cliAuth.exchangeDeviceToken({
        accessToken: "expired-token",
        clientName: "CLI setup",
      }),
    ).rejects.toThrow("Invalid or expired device authorization token");
  });
});
