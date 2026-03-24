import { describe, expect, it, mock } from "bun:test";

import { createContext } from "./context";

describe("api context auth forwarding", () => {
  it("forwards only the cookie header into auth.getSession", async () => {
    const getSession = mock().mockResolvedValueOnce({ user: { id: "user_1" } });
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
    const getSession = mock().mockRejectedValueOnce(new Error("session lookup failed"));
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

  it("verifies x-clanker-api-key headers through Better Auth before exposing them to routers", () => {
    expect(contextSource).toContain('const apiKeyHeader = context.req.raw.headers.get("x-clanker-api-key");');
    expect(contextSource).toContain("auth.api.verifyApiKey");
    expect(contextSource).toContain("valid ? verifiedApiKey.key : null");
    expect(contextSource).not.toContain('const apiKey = context.req.raw.headers.get("x-clanker-api-key");');
  });
});
