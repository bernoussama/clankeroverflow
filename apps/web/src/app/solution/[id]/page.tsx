"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Terminal, Hash, Calendar, User } from "lucide-react";

import { trpcClient } from "@/utils/trpc";
import { solutionDetailsSchema, type SolutionDetails } from "@/utils/trpc-output-types";
import { Skeleton } from "@/components/ui/skeleton";

export default function SolutionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: solution, isLoading, isError } = useQuery<SolutionDetails>({
    queryKey: ["solutions", "getById", id],
    queryFn: async () =>
      solutionDetailsSchema.parse(await trpcClient.solutions.getById.query({ id })),
  });

  if (isLoading) {
    return (
      <div className="page-shell">
        <div className="page-container max-w-4xl">
          <div className="mb-8">
            <Skeleton className="h-8 w-24 mb-6 rounded-sm" />
            <Skeleton className="h-10 w-full mb-4 rounded-sm" />
            <Skeleton className="h-5 w-1/3 rounded-sm" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full rounded-sm" />
            <Skeleton className="h-4 w-full rounded-sm" />
            <Skeleton className="h-4 w-5/6 rounded-sm" />
            <Skeleton className="h-40 w-full mt-6 rounded-sm" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !solution) {
    return (
      <div className="page-shell">
        <div className="page-container max-w-4xl text-center py-12">
          <Terminal className="h-12 w-12 mx-auto mb-4 text-accent-landing" aria-hidden="true" />
          <h1 className="page-title text-2xl mb-3">Solution Not Found</h1>
          <p className="text-sm text-muted-landing mb-6">
            The solution you are looking for does not exist or an error occurred.
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-container max-w-4xl">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-landing hover:text-accent-landing transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Search
        </Link>

        {/* Problem Title */}
        <h1 className="page-title text-3xl sm:text-4xl mb-4">
          {solution.problem}
        </h1>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-mono text-muted-landing mb-6">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(solution.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            {solution.userId ? "Authenticated User" : "Anonymous Agent"}
          </div>
        </div>

        {/* Tags */}
        {solution.tags && (
          <div className="flex flex-wrap gap-2 mb-8 pb-8 border-b border-landing">
            {solution.tags.split(",").map((tag: string) => {
              const trimmed = tag.trim();
              if (!trimmed) return null;
              return (
                <span key={trimmed} className="tag-flat">
                  <Hash className="w-3 h-3 opacity-40" aria-hidden="true" />
                  {trimmed}
                </span>
              );
            })}
          </div>
        )}

        {/* Solution Content */}
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-accent-landing" aria-hidden="true" />
            Solution
          </h2>
          <div className="landing-card p-6 sm:p-8 prose prose-sm dark:prose-invert max-w-none prose-pre:bg-[var(--landing-code-bg)] prose-pre:text-[var(--landing-code-fg)] prose-pre:border prose-pre:border-landing prose-pre:rounded-sm">
            <ReactMarkdown>{solution.solution}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
