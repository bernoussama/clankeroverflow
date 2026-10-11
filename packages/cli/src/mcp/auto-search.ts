import type { SearchMode, SolutionBackend, SolutionResult } from "./backend";

export type SearchAttempt = {
  mode: "keyword";
  resultCount?: number;
  error?: string;
};

export type AutoSearchResult = {
  results: SolutionResult[];
  attempts: SearchAttempt[];
};

export async function searchWithAutoFallback(
  backend: Pick<SolutionBackend, "search">,
  input: {
    query: string;
    limit: number;
    mode: SearchMode;
    allowHybridFallback?: boolean;
    fallbackUnavailableReason?: string;
  },
): Promise<AutoSearchResult> {
  const results = await backend.search({
    query: input.query,
    limit: input.limit,
    mode: "keyword",
  });
  return {
    results,
    attempts: [{ mode: "keyword", resultCount: results.length }],
  };
}
