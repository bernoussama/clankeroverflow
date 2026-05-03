import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const landingPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("./home.tsx", import.meta.url), "utf8");

describe("landing page rendering", () => {
  it("is explicitly static", () => {
    expect(landingPageSource).toContain('export const dynamic = "force-static"');
  });

  it("does not fetch solutions on the landing page", () => {
    expect(homeSource).not.toContain('"use client"');
    expect(homeSource).not.toContain("useQuery");
    expect(homeSource).not.toContain("trpcClient");
  });
});
