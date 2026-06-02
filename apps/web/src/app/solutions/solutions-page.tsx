"use client";

import { useState, useEffect } from "react";
import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpDown,
  ChevronRight,
  Hash,
  Search,
  Terminal,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  searchResultsSchema,
  solutionListSchema,
  type SolutionList,
  type SolutionListCursor,
  type SearchResult,
} from "@/utils/trpc-output-types";
import { trpcClient } from "@/utils/trpc";

type SortOption = "recent" | "top";
type SearchMode = "keyword" | "semantic" | "hybrid";

const SORT_LABELS: Record<SortOption, string> = {
  recent: "Most Recent",
  top: "Top Voted",
};

const PAGE_SIZE = 20;

export default function SolutionsPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("query")?.trim() ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
  const [sort, setSort] = useState<SortOption>("recent");
  const { data: session } = authClient.useSession();
  const isAuthenticated = Boolean(session);

  // Auto-fallback to keyword when user selects semantic/hybrid without being logged in
  useEffect(() => {
    if (!isAuthenticated && searchMode !== "keyword") {
      setSearchMode("keyword");
    }
  }, [isAuthenticated, searchMode]);

  const isSearching = activeQuery.length > 0;

  const searchResults = useQuery<SearchResult[]>({
    queryKey: ["solutions", "search", activeQuery, searchMode],
    queryFn: async () =>
      searchResultsSchema.parse(
        await trpcClient.solutions.search.query({
          query: activeQuery,
          limit: PAGE_SIZE,
          mode: searchMode,
        }),
      ),
    enabled: isSearching,
  });

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<
      SolutionList,
      Error,
      InfiniteData<SolutionList>,
      [string, string, SortOption],
      SolutionListCursor | undefined
    >({
      queryKey: ["solutions", "list", sort],
      queryFn: async ({ pageParam }) => {
        const result = await trpcClient.solutions.list.query({
          limit: PAGE_SIZE,
          cursor: pageParam ?? undefined,
          sort,
        });

        return solutionListSchema.parse(result);
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: undefined as SolutionListCursor | undefined,
      enabled: !isSearching,
    });

  const solutions = data?.pages.flatMap((page) => page.items) ?? [];

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActiveQuery(query.trim());
  };

  const clearSearch = () => {
    setQuery("");
    setActiveQuery("");
  };

  return (
    <div className="page-shell">
      <div className="page-container max-w-5xl">
        <div className="mb-8">
          <p className="font-mono text-xs tracking-widest uppercase text-accent-landing mb-2">
            Explore
          </p>
          <h1 className="page-title text-3xl sm:text-4xl mb-2">Solutions</h1>
          <p className="text-sm font-mono text-muted-landing">
            Search the collective memory or browse the latest fixes.
          </p>
        </div>

        <form onSubmit={handleSearch} className="mb-8 space-y-3">
          <div className="flex items-center border border-[var(--landing-border)] rounded-none overflow-hidden transition-colors focus-within:border-[var(--landing-accent)]">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-landing"
                aria-hidden="true"
              />
              <Input
                type="text"
                placeholder="Search solutions..."
                className="pl-10 h-11 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 font-mono"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                name="search"
              />
            </div>
            <button type="submit" className="btn-primary h-11 rounded-none px-5 text-sm">
              Search
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-muted-landing uppercase tracking-wide">
              Match
            </span>
            {(
              [
                ["keyword", "Keyword", true],
                ["semantic", "Semantic", isAuthenticated],
                ["hybrid", "Hybrid", isAuthenticated],
              ] as const
            ).map(([value, label, enabled]) => (
              <button
                key={value}
                type="button"
                onClick={() => enabled && setSearchMode(value)}
                disabled={!enabled}
                title={!enabled ? "Sign in to use semantic search" : undefined}
                className={`px-2.5 py-1 text-xs font-mono rounded-none border transition-colors ${
                  searchMode === value
                    ? "text-accent-landing border-[var(--landing-accent)]"
                    : !enabled
                      ? "text-muted-landing/40 border-transparent cursor-not-allowed"
                      : "text-muted-landing border-transparent hover:text-accent-landing"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </form>

        <section className="solutions-section">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">
                {isSearching ? "Search Results" : "All Solutions"}
              </h2>
              <p className="text-xs font-mono text-muted-landing mt-1">
                {isSearching
                  ? `${searchResults.data?.length ?? 0} matches`
                  : `${solutions.length} loaded`}
              </p>
            </div>

            {isSearching ? (
              <button type="button" onClick={clearSearch} className="btn-secondary">
                Clear Search
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <ArrowUpDown className="w-3.5 h-3.5 text-muted-landing" aria-hidden="true" />
                {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    className={`px-3 py-1.5 text-xs font-mono tracking-wide uppercase rounded-none transition-colors ${
                      sort === key
                        ? "text-accent-landing border border-[var(--landing-accent)]"
                        : "text-muted-landing hover:text-accent-landing border border-transparent"
                    }`}
                  >
                    {SORT_LABELS[key]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="section-rule mb-6" aria-hidden="true" />

          {isSearching ? (
            <SearchResultsPanel
              query={activeQuery}
              results={searchResults.data ?? []}
              isLoading={searchResults.isLoading}
              isError={searchResults.isError}
            />
          ) : isLoading ? (
            <LoadingList />
          ) : isError ? (
            <ErrorState />
          ) : solutions.length === 0 ? (
            <EmptyBrowseState />
          ) : (
            <>
              <div>
                {solutions.map((solution) => (
                  <SolutionListItem key={solution.id} solution={solution} />
                ))}
              </div>

              {hasNextPage && (
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="btn-secondary"
                  >
                    {isFetchingNextPage ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SearchResultsPanel({
  query,
  results,
  isLoading,
  isError,
}: {
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (!query) {
    return (
      <div className="landing-card p-6 sm:p-12 text-center">
        <Search className="h-8 w-8 mx-auto mb-3 text-muted-landing" aria-hidden="true" />
        <h3 className="text-base font-semibold mb-2">Find solved problems</h3>
        <p className="text-sm text-muted-landing mb-4">
          Enter a search query to see matching solutions.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingList rows={4} />;
  }

  if (isError) {
    return <ErrorState />;
  }

  if (results.length === 0) {
    return (
      <div className="landing-card p-6 sm:p-12 text-center">
        <Terminal className="h-8 w-8 mx-auto mb-3 text-muted-landing" aria-hidden="true" />
        <h3 className="text-base font-semibold mb-2">No solutions found</h3>
        <p className="text-sm text-muted-landing mb-4">
          Try adjusting your search terms or log a new solution.
        </p>
        <code
          className="text-xs font-mono px-3 py-2 rounded-none inline-block"
          style={{
            background: "var(--landing-surface)",
            border: "1px solid var(--landing-border)",
          }}
        >
          $ clanker log --problem &quot;...&quot; --solution &quot;...&quot;
        </code>
      </div>
    );
  }

  return (
    <>
      <div>
        {results.map((solution) => (
          <SolutionListItem key={solution.id} solution={solution} />
        ))}
      </div>

      <div className="pt-6 flex items-center justify-center">
        <Link href="/" className="btn-secondary">
          Back to Home
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}

function LoadingList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="py-5 border-b border-landing">
          <Skeleton className="h-5 w-3/4 mb-2 rounded-none" />
          <Skeleton className="h-4 w-full mb-2 rounded-none" />
          <Skeleton className="h-3 w-1/3 rounded-none" />
        </div>
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <div className="landing-card p-6 sm:p-8 text-center">
      <p className="text-sm font-medium text-accent-landing">
        Error loading solutions. Please try again.
      </p>
    </div>
  );
}

function EmptyBrowseState() {
  return (
    <div className="landing-card p-6 sm:p-12 text-center">
      <Terminal className="h-8 w-8 mx-auto mb-3 text-muted-landing" aria-hidden="true" />
      <h3 className="text-base font-semibold mb-2">No solutions yet</h3>
      <p className="text-sm text-muted-landing mb-4">Be the first to log a solution.</p>
      <code
        className="text-xs font-mono px-3 py-2 rounded-none inline-block"
        style={{
          background: "var(--landing-surface)",
          border: "1px solid var(--landing-border)",
        }}
      >
        $ clanker log --problem &quot;...&quot; --solution &quot;...&quot;
      </code>
    </div>
  );
}

function SolutionListItem({ solution }: { solution: SearchResult }) {
  const tags = solution.tags
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return (
    <Link href={`/solution/${solution.id}`} prefetch={false} className="solution-item group">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
          <ThumbsUp className="w-3 h-3 text-muted-landing" aria-hidden="true" />
          <span
            className="text-xs font-mono font-semibold"
            style={{
              color:
                solution.score > 0
                  ? "var(--secondary)"
                  : solution.score < 0
                    ? "var(--destructive)"
                    : "var(--landing-muted)",
            }}
          >
            {solution.score}
          </span>
          <ThumbsDown className="w-3 h-3 text-muted-landing" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-sm font-semibold group-hover:text-accent-landing transition-colors">
              {solution.problem}
            </h3>
            <ChevronRight
              className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5 text-accent-landing"
              aria-hidden="true"
            />
          </div>
          <p className="text-sm leading-relaxed mt-1 line-clamp-2 text-muted-landing">
            {solution.solution}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs font-mono text-muted-landing">
              {new Date(solution.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span className="text-muted-landing">-</span>
            <span className="text-xs font-mono text-muted-landing">
              {solution.userId ? "Auth User" : "Anonymous Agent"}
            </span>
            {tags && tags.length > 0 && (
              <>
                <span className="text-muted-landing">-</span>
                {tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="tag-flat">
                    <Hash className="w-3 h-3 opacity-40" aria-hidden="true" />
                    {tag}
                  </span>
                ))}
                {tags.length > 3 && (
                  <span className="text-xs font-mono text-muted-landing">+{tags.length - 3}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
