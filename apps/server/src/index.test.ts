import { describe, expect, test } from "bun:test";
import { mockWorkerEnv } from "../test-setup";
import app from "./index";

describe("Server", () => {
  const { createDbMock } = (globalThis as any).__serverTestMocks;

  test("GET / should return OK", async () => {
    const res = await app.request("/", undefined, mockWorkerEnv);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  test("GET / should include hardened security headers", async () => {
    const res = await app.request("/", undefined, mockWorkerEnv);

    expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-site");
    expect(res.headers.get("Origin-Agent-Cluster")).toBe("?1");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-DNS-Prefetch-Control")).toBe("off");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(res.headers.get("Permissions-Policy")).not.toContain("browsing-topics");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  test("GET /trpc/healthCheck should disable caching", async () => {
    const res = await app.request("/trpc/healthCheck", undefined, mockWorkerEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Pragma")).toBe("no-cache");
  });

  test("GET /auth/ok should serve Better Auth from the custom auth path", async () => {
    const res = await app.request("/auth/ok", undefined, mockWorkerEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Pragma")).toBe("no-cache");
  });

  test("POST /trpc/solutions.log should reject cookie-authenticated mutations from untrusted origins", async () => {
    const res = await app.request("/trpc/solutions.log", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=csrf-test",
        origin: "https://evil.example.com",
      },
      body: JSON.stringify({
        json: {
          problem: "Cross-site request",
          solution: "Should be blocked before it reaches the procedure",
        },
      }),
    }, mockWorkerEnv);

    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Forbidden");
  });

  describe("CORS", () => {
    test("OPTIONS / should return CORS headers for the www domain", async () => {
      const res = await app.request(
        "/",
        {
          method: "OPTIONS",
          headers: {
            Origin: "https://www.clankeroverflow.com",
            "Access-Control-Request-Method": "GET",
          },
        },
        mockWorkerEnv,
      );
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://www.clankeroverflow.com",
      );
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,OPTIONS");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("GET / should return CORS headers for the apex domain", async () => {
      const res = await app.request(
        "/",
        {
          headers: {
            Origin: "https://clankeroverflow.com",
          },
        },
        mockWorkerEnv,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://clankeroverflow.com");
    });

    test("uncaught /trpc errors should still return CORS and no-store headers", async () => {
      createDbMock.mockImplementationOnce(async () => {
        throw new Error("db unavailable");
      });

      const res = await app.request(
        "/trpc/healthCheck",
        {
          headers: {
            Origin: "https://www.clankeroverflow.com",
          },
        },
        mockWorkerEnv,
      );

      expect(res.status).toBe(500);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://www.clankeroverflow.com",
      );
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Pragma")).toBe("no-cache");
    });

    test("local dev: empty CORS_ORIGIN binding still reflects localhost:3001 when BETTER_AUTH_URL is local", async () => {
      const envWithoutCors = {
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "test_secret",
        GITHUB_CLIENT_ID: "test-github-client-id",
        GITHUB_CLIENT_SECRET: "test-github-client-secret",
      };

      const res = await app.request(
        "/",
        {
          headers: {
            Origin: "http://localhost:3001",
          },
        },
        envWithoutCors,
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
    });
  });

  describe("tRPC", () => {
    test("GET /trpc/healthCheck should return OK", async () => {
      const res = await app.request("/trpc/healthCheck", undefined, mockWorkerEnv);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { result: { data: string } };
      expect(data).toHaveProperty("result");
      expect(data.result.data).toBe("OK");
    });
  });
});
