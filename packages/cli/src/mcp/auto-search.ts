import type {
  ConcreteSearchMode,
  KeywordSearchStrategy,
  SearchMode,
  SolutionBackend,
  SolutionResult,
} from "./backend";

export type SearchAttempt = {
  mode: ConcreteSearchMode;
  keywordStrategy?: KeywordSearchStrategy;
  resultCount?: number;
  error?: string;
};

export type AutoSearchResult = {
  results: SolutionResult[];
  attempts: SearchAttempt[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function searchWithAutoFallback(
  backend: Pick<SolutionBackend, "search" | "searchExactKeyword">,
  input: {
    query: string;
    limit: number;
    mode: SearchMode;
    allowHybridFallback?: boolean;
    fallbackUnavailableReason?: string;
  },
): Promise<AutoSearchResult> {
  if (input.mode !== "auto") {
    const results = await backend.search({
      query: input.query,
      limit: input.limit,
      mode: input.mode,
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
        mode: "keyword",
        keywordStrategy: "exact",
      });
  const attempts: SearchAttempt[] = [
    { mode: "keyword", keywordStrategy: "exact", resultCount: keywordResults.length },
  ];
  if (keywordResults.length > 0) {
    return { results: keywordResults, attempts };
  }

  if (input.allowHybridFallback === false) {
    attempts.push({
      mode: "hybrid",
      error: input.fallbackUnavailableReason ?? "hybrid fallback unavailable",
    });
    const relaxedResults = await backend.search({
      query: input.query,
      limit: input.limit,
      mode: "keyword",
      keywordStrategy: "tiered",
    });
    attempts.push({
      mode: "keyword",
      keywordStrategy: "tiered",
      resultCount: relaxedResults.length,
    });
    return { results: relaxedResults, attempts };
  }

  try {
    const hybridResults = await backend.search({
      query: input.query,
      limit: input.limit,
      mode: "hybrid",
    });
    attempts.push({ mode: "hybrid", resultCount: hybridResults.length });
    return { results: hybridResults, attempts };
  } catch (error) {
    attempts.push({ mode: "hybrid", error: errorMessage(error) });
    const relaxedResults = await backend.search({
      query: input.query,
      limit: input.limit,
      mode: "keyword",
      keywordStrategy: "tiered",
    });
    attempts.push({
      mode: "keyword",
      keywordStrategy: "tiered",
      resultCount: relaxedResults.length,
    });
    return { results: relaxedResults, attempts };
  }
}
