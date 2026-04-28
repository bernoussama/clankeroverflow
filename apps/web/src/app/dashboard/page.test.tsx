import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const dashboardPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("dashboard page auth gate", () => {
  it("forwards only the cookie header to the auth server", () => {
    expect(dashboardPageSource).toContain('const requestHeaders = await headers();');
    expect(dashboardPageSource).toContain('cookie: requestHeaders.get("cookie") ?? ""');
    expect(dashboardPageSource).not.toContain("headers: await headers()");
  });
});
