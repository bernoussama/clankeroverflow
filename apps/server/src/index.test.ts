import { describe, expect, test } from "bun:test";
import app from "./index";

describe("Server", () => {
  test("GET / should return OK", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  describe("CORS", () => {
    test("OPTIONS / should return CORS headers for the www domain", async () => {
      const res = await app.request("/", {
        method: "OPTIONS",
        headers: {
          "Origin": "https://www.clankeroverflow.com",
          "Access-Control-Request-Method": "GET"
        }
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.clankeroverflow.com");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,OPTIONS");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("GET / should return CORS headers for the apex domain", async () => {
      const res = await app.request("/", {
        headers: {
          "Origin": "https://clankeroverflow.com"
        }
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://clankeroverflow.com");
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
});
