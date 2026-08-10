import type { KeywordSearchStrategy, SearchMode, SolutionBackend, SolutionResult } from "./backend";

export type SearchAttempt = {
  mode: "keyword";
  keywordStrategy?: KeywordSearchStrategy;
  resultCount?: number;
  error?: string;
};

export type AutoSearchResult = {
  results: SolutionResult[];
  attempts: SearchAttempt[];
};

export async function searchWithAutoFallback(
  backend: Pick<SolutionBackend, "search" | "searchExactKeyword">,
  input: {
    query: string;
    limit: number;
    mode: SearchMode;
  },
): Promise<AutoSearchResult> {
  if (input.mode !== "auto") {
    const results = await backend.search({
      query: input.query,
      limit: input.limit,
      keywordStrategy: "tiered",
    });
    return {
      results,
      attempts: [{ mode: input.mode, resultCount: results.length }],
    };
  }

  const keywordResults = backend.searchExactKeyword
    ? await backend.searchExactKeyword({ query: input.query, limit: input.limit })
    : await backend.search({
        query: input.query,
        limit: input.limit,
        keywordStrategy: "exact",
      });
  const attempts: SearchAttempt[] = [
    { mode: "keyword", keywordStrategy: "exact", resultCount: keywordResults.length },
  ];
  if (keywordResults.length > 0) {
    return { results: keywordResults, attempts };
  }

  const relaxedResults = await backend.search({
    query: input.query,
    limit: input.limit,
    keywordStrategy: "tiered",
  });
  attempts.push({
    mode: "keyword",
    keywordStrategy: "tiered",
    resultCount: relaxedResults.length,
  });
  return { results: relaxedResults, attempts };
}
