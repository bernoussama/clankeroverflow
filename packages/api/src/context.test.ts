import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const contextSource = readFileSync(new URL("./context.ts", import.meta.url), "utf8");

describe("api context auth forwarding", () => {
  it("forwards only the cookie header into auth.getSession", () => {
    expect(contextSource).toContain('cookie: cookieHeader ?? ""');
    expect(contextSource).not.toContain("headers: context.req.raw.headers");
  });
});
