import { describe, expect, test } from "bun:test";
import app from "./index";

describe("Server", () => {
  test("GET / should return OK", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  test("GET / should include hardened security headers", async () => {
    const res = await app.request("/");

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
    const res = await app.request("/trpc/healthCheck");

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
    });

    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Forbidden");
  });

  describe("CORS", () => {
    test("OPTIONS / should return CORS headers for the www domain", async () => {
      const res = await app.request("/", {
        method: "OPTIONS",
        headers: {
          Origin: "https://www.clankeroverflow.com",
          "Access-Control-Request-Method": "GET",
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://www.clankeroverflow.com",
      );
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,OPTIONS");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("GET / should return CORS headers for the apex domain", async () => {
      const res = await app.request("/", {
        headers: {
          Origin: "https://clankeroverflow.com",
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://clankeroverflow.com");
    });
  });

  describe("tRPC", () => {
    test("GET /trpc/healthCheck should return OK", async () => {
      const res = await app.request("/trpc/healthCheck");
      expect(res.status).toBe(200);
      const data = (await res.json()) as { result: { data: string } };
      expect(data).toHaveProperty("result");
      expect(data.result.data).toBe("OK");
    });
  });
});
