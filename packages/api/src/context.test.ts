import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createContext } from "./context";

const contextSource = readFileSync(fileURLToPath(new URL("./context.ts", import.meta.url)), "utf8");

describe("api context auth forwarding", () => {
  it("forwards only the cookie header into auth.getSession", async () => {
    const getSession = vi.fn().mockResolvedValueOnce({ user: { id: "user_1" } });
    const context = {
      req: {
        raw: new Request("http://localhost/trpc/healthCheck", {
          headers: {
            cookie: "better-auth.session_token=test-token",
            origin: "http://localhost:3001",
          },
        }),
      },
      get(key: string) {
        if (key === "auth") {
          return {
            api: {
              getSession,
            },
          };
        }

        if (key === "db") {
          return {};
        }

        return undefined;
      },
    } as any;

    await createContext({ context });

    expect(getSession).toHaveBeenCalledWith({
      headers: {
        cookie: "better-auth.session_token=test-token",
      },
    });
  });

  it("treats auth session lookup failures as unauthenticated requests", async () => {
    const getSession = vi.fn().mockRejectedValueOnce(new Error("session lookup failed"));
    const context = {
      req: {
        raw: new Request("http://localhost/trpc/apiKeys.list", {
          headers: {
            cookie: "better-auth.session_token=test-token",
          },
        }),
      },
      get(key: string) {
        if (key === "auth") {
          return {
            api: {
              getSession,
            },
          };
        }

        if (key === "db") {
          return {};
        }

        return undefined;
      },
    } as any;

    const result = await createContext({ context });

    expect(result.session).toBeNull();
  });

  it("identifies authenticated users with the request-scoped PostHog client", async () => {
    const identify = vi.fn();
    const getSession = vi.fn().mockResolvedValueOnce({
      user: {
        id: "user_1",
        email: "test@example.com",
        name: "Test User",
      },
    });
    const context = {
      req: {
        raw: new Request("http://localhost/trpc/healthCheck", {
          headers: {
            cookie: "better-auth.session_token=test-token",
          },
        }),
      },
      get(key: string) {
        if (key === "auth") {
          return {
            api: {
              getSession,
            },
          };
        }

        if (key === "db") {
          return {};
        }

        if (key === "posthog") {
          return { identify };
        }

        return undefined;
      },
    } as any;

    await createContext({ context });

    expect(identify).toHaveBeenCalledWith({
      distinctId: "user_1",
      properties: {
        email: "test@example.com",
        name: "Test User",
      },
    });
  });

  it("adds safe auth metadata to the request wide event", async () => {
    const requestLog: Record<string, unknown> = {};
    const verifyApiKey = vi.fn().mockResolvedValueOnce({
      valid: true,
      key: {
        id: "key_1",
        referenceId: "user_1",
      },
    });
    const context = {
      req: {
        raw: new Request("http://localhost/trpc/healthCheck", {
          headers: {
            "x-clanker-api-key": "clk_secret",
          },
        }),
      },
      get(key: string) {
        if (key === "auth") {
          return {
            api: {
              verifyApiKey,
            },
          };
        }

        if (key === "db") {
          return {};
        }

        if (key === "requestLog") {
          return requestLog;
        }

        return undefined;
      },
    } as any;

    await createContext({ context });

    expect(requestLog).toMatchObject({
      auth_type: "api_key",
      api_key_id: "key_1",
      api_key_user_id: "user_1",
      has_session_cookie: false,
      has_api_key_header: true,
      api_key_valid: true,
    });
    expect(JSON.stringify(requestLog)).not.toContain("clk_secret");
  });

  it("verifies x-clanker-api-key headers through Better Auth before exposing them to routers", () => {
    expect(contextSource).toContain(
      'const apiKeyHeader = context.req.raw.headers.get("x-clanker-api-key");',
    );
    expect(contextSource).toContain("auth.api.verifyApiKey");
    expect(contextSource).toContain("valid ? verifiedApiKey.key : null");
    expect(contextSource).not.toContain(
      'const apiKey = context.req.raw.headers.get("x-clanker-api-key");',
    );
  });
});
