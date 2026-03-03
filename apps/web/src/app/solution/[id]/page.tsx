"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Terminal, Hash, Calendar, User } from "lucide-react";

import { trpc } from "@/utils/trpc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function SolutionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: solution, isLoading, isError } = useQuery(
    trpc.solutions.getById.queryOptions({ id })
  );

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-24 mb-6" />
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-6 w-1/3" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-40 w-full mt-6" />
        </div>
      </div>
    );
  }

  if (isError || !solution) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <Terminal className="h-16 w-16 text-destructive mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-4">Solution Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The solution you are looking for does not exist or an error occurred.
        </p>
        <Button onClick={() => router.back()} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-6 -ml-3 text-muted-foreground")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Search
        </Link>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
          {solution.problem}
        </h1>

        <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-sm text-muted-foreground mb-6">
          <div className="flex items-center">
            <Calendar className="mr-2 h-4 w-4" />
            {new Date(solution.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
          <div className="flex items-center">
            <User className="mr-2 h-4 w-4" />
            {solution.userId ? "Authenticated User" : "Anonymous Agent"}
          </div>
        </div>

        {solution.tags && (
          <div className="flex flex-wrap gap-2 mb-8 border-b pb-8">
            {solution.tags.split(",").map((tag) => {
              const trimmed = tag.trim();
              if (!trimmed) return null;
              return (
                <span
                  key={trimmed}
                  className="inline-flex items-center px-2.5 py-1 rounded-md text-sm bg-secondary text-secondary-foreground font-medium"
                >
                  <Hash className="w-3.5 h-3.5 mr-1 opacity-50" />
                  {trimmed}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:text-foreground prose-pre:border">
        <h2 className="text-2xl font-bold mb-4 flex items-center">
          <Terminal className="mr-2 h-6 w-6" /> Solution
        </h2>
        <div className="bg-card border rounded-lg p-6 sm:p-8 shadow-sm">
          <ReactMarkdown>{solution.solution}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}