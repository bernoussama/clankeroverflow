"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Terminal, Hash, Calendar, User, ThumbsUp, ThumbsDown } from "lucide-react";

import { trpcClient } from "@/utils/trpc";
import { solutionDetailsSchema, type SolutionDetails } from "@/utils/trpc-output-types";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";

export default function SolutionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [isVoting, setIsVoting] = useState(false);
  const queryClient = useQueryClient();
  const sessionUserId = session?.user.id ?? null;
  const solutionQueryKey = ["solutions", "getById", id, sessionUserId] as const;

  const {
    data: solution,
    isLoading,
    isError,
  } = useQuery<SolutionDetails>({
    queryKey: solutionQueryKey,
    queryFn: async () =>
      solutionDetailsSchema.parse(await trpcClient.solutions.getById.query({ id })),
    enabled: !isSessionPending,
  });

  const [voteError, setVoteError] = useState<string | null>(null);

  const handleVote = useCallback(
    async (isUpvote: boolean) => {
      if (isVoting || !session) return;
      setIsVoting(true);
      setVoteError(null);
      try {
        const result = await trpcClient.solutions.vote.mutate({ id, isUpvote });
        queryClient.setQueryData(solutionQueryKey, (old: SolutionDetails | undefined) => {
          if (!old) return old;
          return {
            ...old,
            upvotes: result.upvotes,
            downvotes: result.downvotes,
            userVote: result.userVote,
          };
        });
      } catch {
        setVoteError("Failed to record vote. Please try again.");
      } finally {
        setIsVoting(false);
      }
    },
    [id, isVoting, queryClient, session, solutionQueryKey],
  );

  if (isLoading) {
    return (
      <div className="page-shell">
        <div className="page-container max-w-4xl">
          <div className="mb-8">
            <Skeleton className="h-8 w-24 mb-6 rounded-none" />
            <Skeleton className="h-10 w-full mb-4 rounded-none" />
            <Skeleton className="h-5 w-1/3 rounded-none" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full rounded-none" />
            <Skeleton className="h-4 w-full rounded-none" />
            <Skeleton className="h-4 w-5/6 rounded-none" />
            <Skeleton className="h-40 w-full mt-6 rounded-none" />
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
          <button type="button" onClick={() => router.back()} className="btn-secondary">
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
        <h1 className="page-title text-3xl sm:text-4xl mb-4">{solution.problem}</h1>

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
          <div className="flex flex-wrap gap-2 mb-6">
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

        {/* Voting */}
        <div className="flex items-center gap-3 mb-8 pb-8 border-b border-landing">
          <button
            type="button"
            className={`vote-btn ${solution.userVote === true ? "vote-btn--active-up" : ""}`}
            onClick={() => handleVote(true)}
            disabled={isVoting || !session}
            title={session ? "Upvote" : "Sign in to vote"}
          >
            <ThumbsUp className="w-4 h-4" />
            {solution.upvotes}
          </button>
          <button
            type="button"
            className={`vote-btn ${solution.userVote === false ? "vote-btn--active-down" : ""}`}
            onClick={() => handleVote(false)}
            disabled={isVoting || !session}
            title={session ? "Downvote" : "Sign in to vote"}
          >
            <ThumbsDown className="w-4 h-4" />
            {solution.downvotes}
          </button>
          {!session && (
            <Link
              href="/login"
              className="text-xs font-mono text-muted-landing hover:text-accent-landing transition-colors"
            >
              Sign in to vote
            </Link>
          )}
          {voteError && <span className="text-error text-xs font-mono">{voteError}</span>}
        </div>

        {/* Solution Content */}
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight mb-4 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-accent-landing" aria-hidden="true" />
            Solution
          </h2>
          <div className="landing-card p-6 sm:p-8 prose prose-sm dark:prose-invert max-w-none prose-pre:bg-[var(--landing-code-bg)] prose-pre:text-[var(--landing-code-fg)] prose-pre:border prose-pre:border-landing prose-pre:rounded-none">
            <ReactMarkdown>{solution.solution}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
