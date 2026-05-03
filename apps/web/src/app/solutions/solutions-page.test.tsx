import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const solutionsPageSource = readFileSync(new URL("./solutions-page.tsx", import.meta.url), "utf8");

describe("solutions page performance defaults", () => {
  it("defaults search to keyword mode to avoid implicit semantic latency", () => {
    expect(solutionsPageSource).toContain('useState<SearchMode>("keyword")');
  });

  it("does not prefetch every visible solution detail route", () => {
    expect(solutionsPageSource).toContain('prefetch={false}');
    expect(solutionsPageSource).toContain('href={`/solution/${solution.id}`}');
  });
});
