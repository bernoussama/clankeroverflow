import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const solutionsPageSource = readFileSync(new URL("./solutions-page.tsx", import.meta.url), "utf8");
const solutionPageSource = readFileSync(
  new URL("../solution/[id]/solution-page.tsx", import.meta.url),
  "utf8",
);

describe("knowledge base page", () => {
  it("hydrates search from the query string and searches the team knowledge base", () => {
    expect(solutionsPageSource).toContain("useSearchParams");
    expect(solutionsPageSource).toContain('searchParams.get("query")');
    expect(solutionsPageSource).toContain("trpcClient.kb.search.query");
    expect(solutionsPageSource).toContain("trpcClient.kb.read.query");
    expect(solutionsPageSource).toContain("trpcClient.kb.browse.query");
  });

  it("tracks search without capturing the raw query text", () => {
    const analytics = solutionsPageSource.slice(
      solutionsPageSource.indexOf('capturePostHogEvent("knowledge_search_submitted"'),
      solutionsPageSource.indexOf("if (!trimmedQuery)"),
    );
    expect(analytics).toContain("query_length: trimmedQuery.length");
    expect(analytics).not.toMatch(/\n\s+query:/);
  });

  it("uses the shared landing components", () => {
    expect(solutionsPageSource).toContain("landing-card");
    expect(solutionsPageSource).toContain("btn-primary");
  });
});

describe("retired public solution page", () => {
  it("points people at the team knowledge base", () => {
    expect(solutionPageSource).toContain("public solution corpus has been shut down");
    expect(solutionPageSource).toContain('href="/solutions"');
  });
});
