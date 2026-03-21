import { describe, expect, it } from "bun:test";

describe("auth api key helpers", () => {
  it("hashes API keys and derives a stable preview", async () => {
    const apiKeyModule = await import("./api-keys").catch(() => null);

    expect(apiKeyModule).not.toBeNull();

    if (!apiKeyModule) {
      return;
    }

    const key = "clk_1234567890abcdef";
    const hash = await apiKeyModule.hashApiKey(key);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await apiKeyModule.hashApiKey(key)).toBe(hash);
    expect(apiKeyModule.getApiKeyPreview(key)).toBe("clk_1234...cdef");
  });
});
