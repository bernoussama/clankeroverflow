import { describe, expect, test, vi } from "vitest";

import type { SolutionBackend, SolutionResult } from "./backend";
import { searchWithAutoFallback } from "./auto-search";

const result = (id: string): SolutionResult => ({
  id,
  problem: id,
  solution: id,
  tags: null,
  score: 0,
});

describe("searchWithAutoFallback", () => {
  test("returns an exact keyword hit without a second attempt", async () => {
    const backend = {
      search: vi.fn(),
      searchExactKeyword: vi.fn(async () => [result("exact")]),
    } satisfies Pick<SolutionBackend, "search" | "searchExactKeyword">;
    const output = await searchWithAutoFallback(backend, {
      query: "EADDRINUSE",
      limit: 1,
      mode: "auto",
    });
    expect(output.results[0]?.id).toBe("exact");
    expect(backend.search).not.toHaveBeenCalled();
    expect(output.attempts).toEqual([
      { mode: "keyword", keywordStrategy: "exact", resultCount: 1 },
    ]);
  });

  test("runs tiered keyword retrieval after an empty exact probe", async () => {
    const backend = {
      searchExactKeyword: vi.fn(async () => []),
      search: vi.fn(async () => [result("tiered")]),
    } satisfies Pick<SolutionBackend, "search" | "searchExactKeyword">;
    const output = await searchWithAutoFallback(backend, {
      query: "address occupied",
      limit: 1,
      mode: "auto",
    });
    expect(output.results[0]?.id).toBe("tiered");
    expect(backend.search).toHaveBeenCalledWith({
      query: "address occupied",
      limit: 1,
      keywordStrategy: "tiered",
    });
    expect(output.attempts).toEqual([
      { mode: "keyword", keywordStrategy: "exact", resultCount: 0 },
      { mode: "keyword", keywordStrategy: "tiered", resultCount: 1 },
    ]);
  });

  test("explicit keyword mode runs tiered retrieval directly", async () => {
    const backend = { search: vi.fn(async () => [result("tiered")]) };
    const output = await searchWithAutoFallback(backend, {
      query: "natural language",
      limit: 1,
      mode: "keyword",
    });
    expect(output.results[0]?.id).toBe("tiered");
    expect(output.attempts).toEqual([{ mode: "keyword", resultCount: 1 }]);
  });
});
