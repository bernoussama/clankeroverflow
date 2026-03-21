"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import {
  Terminal,
  Hash,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  ArrowUpDown,
} from "lucide-react";

import { trpcClient } from "@/utils/trpc";
import { solutionListSchema, type SearchResult } from "@/utils/trpc-output-types";
import { Skeleton } from "@/components/ui/skeleton";

type SortOption = "recent" | "top";

const SORT_LABELS: Record<SortOption, string> = {
  recent: "Most Recent",
  top: "Top Voted",
};

const PAGE_SIZE = 20;

export default function SolutionsPage() {
  const [sort, setSort] = useState<SortOption>("recent");

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
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
    initialPageParam: undefined as string | undefined,
  });

  const solutions = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="page-shell">
      <div className="page-container max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="font-mono text-xs tracking-widest uppercase text-accent-landing mb-2">
              Browse
            </p>
            <h1 className="page-title text-3xl sm:text-4xl">
              All Solutions
            </h1>
          </div>

          {/* Sort Toggle */}
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-landing" aria-hidden="true" />
            {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={`px-3 py-1.5 text-xs font-mono tracking-wide uppercase rounded-sm transition-colors ${
                  sort === key
                    ? "text-accent-landing border border-[var(--landing-accent)]"
                    : "text-muted-landing hover:text-accent-landing border border-transparent"
                }`}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="section-rule mb-6" aria-hidden="true" />

        {/* Loading */}
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="py-5 border-b border-landing"
              >
                <Skeleton className="h-5 w-3/4 mb-2 rounded-sm" />
                <Skeleton className="h-4 w-full mb-2 rounded-sm" />
                <Skeleton className="h-3 w-1/3 rounded-sm" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="landing-card p-8 text-center">
            <p className="text-sm font-medium text-accent-landing">
              Error loading solutions. Please try again.
            </p>
          </div>
        ) : solutions.length === 0 ? (
          <div className="landing-card p-12 text-center">
            <Terminal
              className="h-8 w-8 mx-auto mb-3 text-muted-landing"
              aria-hidden="true"
            />
            <h3 className="text-base font-semibold mb-2">No solutions yet</h3>
            <p className="text-sm text-muted-landing mb-4">
              Be the first to log a solution.
            </p>
            <code
              className="text-xs font-mono px-3 py-2 rounded-sm inline-block"
              style={{
                background: "var(--landing-surface)",
                border: "1px solid var(--landing-border)",
              }}
            >
              $ clanker log --problem &quot;…&quot; --solution &quot;…&quot;
            </code>
          </div>
        ) : (
          <>
            {/* Solution List */}
            <div>
              {solutions.map((solution: SearchResult) => (
                <Link
                  key={solution.id}
                  href={`/solution/${solution.id}`}
                  className="solution-item group"
                >
                  <div className="flex items-start gap-4">
                    {/* Score badge */}
                    <div className="flex-shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
                      <ThumbsUp className="w-3 h-3 text-muted-landing" aria-hidden="true" />
                      <span className="text-xs font-mono font-semibold" style={{ color: solution.score > 0 ? "#16a34a" : solution.score < 0 ? "var(--destructive)" : "var(--landing-muted)" }}>
                        {solution.score}
                      </span>
                      <ThumbsDown className="w-3 h-3 text-muted-landing" aria-hidden="true" />
                    </div>

                    {/* Content */}
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
                        {solution.tags && (
                          <>
                            <span className="text-muted-landing">·</span>
                            {solution.tags.split(",").slice(0, 3).map((tag: string) => {
                              const t = tag.trim();
                              if (!t) return null;
                              return (
                                <span key={t} className="tag-flat">
                                  <Hash className="w-3 h-3 opacity-40" aria-hidden="true" />
                                  {t}
                                </span>
                              );
                            })}
                            {solution.tags.split(",").length > 3 && (
                              <span className="text-xs font-mono text-muted-landing">
                                +{solution.tags.split(",").length - 3}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Load More */}
            {hasNextPage && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="btn-secondary"
                >
                  {isFetchingNextPage ? "Loading…" : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
