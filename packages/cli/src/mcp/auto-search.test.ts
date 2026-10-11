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
  test("searches the markdown knowledge base once", async () => {
    const backend = {
      search: vi.fn(async () => [result("markdown")]),
    } satisfies Pick<SolutionBackend, "search">;

    const output = await searchWithAutoFallback(backend, {
      query: "EADDRINUSE",
      limit: 1,
      mode: "auto",
    });

    expect(output.results[0]?.id).toBe("markdown");
    expect(backend.search).toHaveBeenCalledTimes(1);
    expect(backend.search).toHaveBeenCalledWith({
      query: "EADDRINUSE",
      limit: 1,
      mode: "keyword",
    });
    expect(output.attempts).toEqual([{ mode: "keyword", resultCount: 1 }]);
  });
});
