import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const contextSource = readFileSync(new URL("./context.ts", import.meta.url), "utf8");

describe("api context auth forwarding", () => {
  it("forwards only the cookie header into auth.getSession", () => {
    expect(contextSource).toContain('cookie: cookieHeader ?? ""');
    expect(contextSource).not.toContain("headers: context.req.raw.headers");
  });

  it("verifies x-clanker-api-key headers through Better Auth before exposing them to routers", () => {
    expect(contextSource).toContain('const apiKeyHeader = context.req.raw.headers.get("x-clanker-api-key");');
    expect(contextSource).toContain("auth.api.verifyApiKey");
    expect(contextSource).toContain("valid ? verifiedApiKey.key : null");
    expect(contextSource).not.toContain('const apiKey = context.req.raw.headers.get("x-clanker-api-key");');
  });
});
