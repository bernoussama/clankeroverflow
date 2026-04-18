import { describe, expect, test } from "bun:test";
import app from "./index";

/** Matches `CORS_ORIGIN` in `test-setup.ts` (Cloudflare env mock). */
const TEST_CORS_ORIGIN = "https://cors.test";

describe("Server", () => {
  test("GET / should return OK", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  describe("CORS", () => {
    test("OPTIONS / should return CORS headers", async () => {
      const res = await app.request("/", {
        method: "OPTIONS",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Access-Control-Request-Method": "GET",
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(TEST_CORS_ORIGIN);
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,OPTIONS");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("GET / should return CORS headers for valid origin", async () => {
      const res = await app.request("/", {
        headers: {
          Origin: TEST_CORS_ORIGIN,
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(TEST_CORS_ORIGIN);
    });
  });

  describe("tRPC", () => {
    test("GET /trpc/healthCheck should return OK", async () => {
      const res = await app.request("/trpc/healthCheck");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("result");
      expect(data.result.data).toBe("OK");
    });
  });

  test("GET /health should return OK", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  test("GET /jwks should return a JWKS object", async () => {
    const res = await app.request("/jwks");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { keys: unknown[] };
    expect(data).toHaveProperty("keys");
    expect(Array.isArray(data.keys)).toBe(true);
  });
});
