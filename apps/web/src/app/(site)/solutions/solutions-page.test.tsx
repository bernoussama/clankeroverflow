import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const solutionsPageSource = readFileSync(new URL("./solutions-page.tsx", import.meta.url), "utf8");
const solutionPageSource = readFileSync(
  new URL("../solution/[id]/solution-page.tsx", import.meta.url),
  "utf8",
);

describe("solutions page performance defaults", () => {
  it("defaults search to keyword mode to avoid implicit semantic latency", () => {
    expect(solutionsPageSource).toContain('useState<SearchMode>("keyword")');
  });

  it("does not prefetch every visible solution detail route", () => {
    expect(solutionsPageSource).toContain("prefetch={false}");
    expect(solutionsPageSource).toContain("href={`/solution/${solution.id}`}");
  });

  it("hydrates search from the query string", () => {
    expect(solutionsPageSource).toContain("useSearchParams");
    expect(solutionsPageSource).toContain('searchParams.get("query")');
  });
});

describe("solution page vote state", () => {
  it("scopes solution details to the resolved session and preserves the mutation response", () => {
    expect(solutionPageSource).toContain(
      'const solutionQueryKey = ["solutions", "getById", id, sessionUserId] as const;',
    );
    expect(solutionPageSource).toContain("enabled: session !== undefined");
    expect(solutionPageSource).toContain("queryClient.setQueryData(");
    expect(solutionPageSource).not.toContain("queryClient.invalidateQueries");
  });

  it("avoids showing Solution Not Found when the session is loading", () => {
    expect(solutionPageSource).toContain("session === undefined || isLoading");
  });
});
