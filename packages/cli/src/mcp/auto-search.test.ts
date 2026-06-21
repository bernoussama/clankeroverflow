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
  test("returns an exact keyword hit without invoking hybrid", async () => {
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

  test("runs hybrid after an empty exact probe", async () => {
    const backend = {
      searchExactKeyword: vi.fn(async () => []),
      search: vi.fn(async (input) => (input.mode === "hybrid" ? [result("hybrid")] : [])),
    } satisfies Pick<SolutionBackend, "search" | "searchExactKeyword">;

    const output = await searchWithAutoFallback(backend, {
      query: "address already occupied",
      limit: 1,
      mode: "auto",
    });
    expect(output.results[0]?.id).toBe("hybrid");
    expect(backend.search).toHaveBeenCalledWith({
      query: "address already occupied",
      limit: 1,
      mode: "hybrid",
    });
  });

  test("returns tiered keyword results when hybrid is unavailable", async () => {
    const backend = {
      searchExactKeyword: vi.fn(async () => []),
      search: vi.fn(async (input) =>
        input.keywordStrategy === "tiered" ? [result("relaxed")] : [],
      ),
    } satisfies Pick<SolutionBackend, "search" | "searchExactKeyword">;

    const output = await searchWithAutoFallback(backend, {
      query: "natural language symptoms",
      limit: 1,
      mode: "auto",
      allowHybridFallback: false,
      fallbackUnavailableReason: "not configured",
    });
    expect(output.results[0]?.id).toBe("relaxed");
    expect(output.attempts.at(-1)).toEqual({
      mode: "keyword",
      keywordStrategy: "tiered",
      resultCount: 1,
    });
  });

  test("returns tiered keyword results after hybrid throws", async () => {
    const backend = {
      searchExactKeyword: vi.fn(async () => []),
      search: vi.fn(async (input) => {
        if (input.mode === "hybrid") throw new Error("embedding unavailable");
        return [result("relaxed")];
      }),
    } satisfies Pick<SolutionBackend, "search" | "searchExactKeyword">;

    const output = await searchWithAutoFallback(backend, {
      query: "natural language symptoms",
      limit: 1,
      mode: "auto",
    });
    expect(output.results[0]?.id).toBe("relaxed");
    expect(output.attempts).toContainEqual({
      mode: "hybrid",
      error: "embedding unavailable",
    });
  });
});
