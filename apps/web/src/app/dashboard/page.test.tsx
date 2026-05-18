import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dashboardPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("dashboard page rendering", () => {
  it("keeps auth checks client-side", () => {
    expect(dashboardPageSource).not.toContain('from "next/headers"');
    expect(dashboardPageSource).not.toContain('from "next/navigation"');
    expect(dashboardPageSource).not.toContain("authClient.getSession");
    expect(dashboardPageSource).toContain("return <Dashboard />");
  });
});
