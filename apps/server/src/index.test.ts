import { describe, expect, test } from "bun:test";
import app from "./index";

describe("Server", () => {
  test("GET / returns OK", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  describe("CORS", () => {
    test("OPTIONS returns CORS headers for valid origin", async () => {
      const res = await app.request("/", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3001",
          "Access-Control-Request-Method": "GET",
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,OPTIONS");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("allows x-api-key header", async () => {
      const res = await app.request("/", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3001",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "x-api-key",
        },
      });
      expect(res.status).toBe(204);
      const allowedHeaders = res.headers.get("Access-Control-Allow-Headers") ?? "";
      expect(allowedHeaders.toLowerCase()).toContain("x-api-key");
    });

    test("allows x-clanker-api-key header", async () => {
      const res = await app.request("/", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3001",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "x-clanker-api-key",
        },
      });
      expect(res.status).toBe(204);
      const allowedHeaders = res.headers.get("Access-Control-Allow-Headers") ?? "";
      expect(allowedHeaders.toLowerCase()).toContain("x-clanker-api-key");
    });

    test("GET returns CORS headers for valid origin", async () => {
      const res = await app.request("/", {
        headers: { Origin: "http://localhost:3001" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
    });
  });

  describe("tRPC", () => {
    test("GET /trpc/healthCheck returns OK", async () => {
      const res = await app.request("/trpc/healthCheck");
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data).toHaveProperty("result");
      expect(data.result.data).toBe("OK");
    });
  });

  describe("rate limiter", () => {
    test("allows requests under the limit", async () => {
      const res = await app.request("/trpc/healthCheck", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      });
      expect(res.status).toBe(200);
    });

    test("skips rate limiting for OPTIONS", async () => {
      const res = await app.request("/trpc/healthCheck", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3001",
          "Access-Control-Request-Method": "GET",
          "x-forwarded-for": "10.0.0.99",
        },
      });
      expect(res.status).toBe(204);
    });
  });
});
