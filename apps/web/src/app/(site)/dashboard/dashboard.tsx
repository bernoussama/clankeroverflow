"use client";

import { useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import Link from "next/link";
import { Key, Plus, Trash2, Copy, Check, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  createdApiKeySchema,
  formatApiKeyPreview,
  listApiKeysResultSchema,
  type ApiKeyListItem,
  type CreatedApiKey,
} from "@/lib/api-key-client";
import { authClient } from "@/lib/auth-client";
import Loader from "@/components/loader";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  solutionListSchema,
  type SearchResult,
  type SolutionList,
  type SolutionListCursor,
} from "@/utils/trpc-output-types";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function Dashboard() {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const queryClient = useQueryClient();
  const sessionUserId = session?.user?.id;
  const apiKeysQueryKey = ["apiKeys", "list", sessionUserId] as const;
  const mySolutionsQueryKey = ["solutions", "mine", sessionUserId] as const;

  useEffect(() => {
    if (!isSessionPending && !session) {
      router.replace("/login");
    }
  }, [isSessionPending, router, session]);

  // Clear stale API key cache when the authenticated user changes
  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: ["apiKeys"] });
    };
  }, [sessionUserId, queryClient]);

  const { data: apiKeys = [], isLoading } = useQuery<ApiKeyListItem[]>({
    queryKey: apiKeysQueryKey,
    queryFn: async () => {
      const result = listApiKeysResultSchema.parse(
        await authClient.apiKey.list({
          query: {
            sortBy: "createdAt",
            sortDirection: "desc",
          },
        }),
      );

      return result.apiKeys;
    },
    enabled: Boolean(session),
  });

  const {
    data: mySolutionsData,
    isLoading: isMySolutionsLoading,
    isFetchingNextPage: isFetchingMoreSolutions,
    fetchNextPage: fetchMoreSolutions,
    hasNextPage: hasMoreSolutions,
  } = useInfiniteQuery<
    SolutionList,
    Error,
    InfiniteData<SolutionList>,
    typeof mySolutionsQueryKey,
    SolutionListCursor | undefined
  >({
    queryKey: mySolutionsQueryKey,
    queryFn: async ({ pageParam }) =>
      solutionListSchema.parse(
        await trpcClient.solutions.mine.query({
          limit: 20,
          cursor: pageParam ?? undefined,
        }),
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as SolutionListCursor | undefined,
    enabled: Boolean(session),
  });

  const mySolutions = mySolutionsData?.pages.flatMap((page) => page.items) ?? [];

  const createMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) =>
      createdApiKeySchema.parse(
        await authClient.apiKey.create({
          name,
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData<ApiKeyListItem[]>(apiKeysQueryKey, (current = []) => [
        {
          createdAt: data.createdAt,
          id: data.id,
          name: data.name,
          prefix: data.prefix,
          start: data.start,
        },
        ...current.filter((apiKey) => apiKey.id !== data.id),
      ]);
      queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });
      setNewKeyName("");
      setCreatedKey(data);
      toast.success("API Key created successfully");

      void navigator.clipboard
        .writeText(data.key)
        .then(() => {
          toast.info("API Key copied to clipboard.");
        })
        .catch(() => {
          toast.info(
            "API key created. Clipboard access was blocked, so copy it from the panel above before dismissing it.",
          );
        });
    },
    onError: (error) => {
      toast.error(`Failed to create API key: ${getErrorMessage(error)}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      authClient.apiKey.delete({
        keyId: id,
      }),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<ApiKeyListItem[]>(apiKeysQueryKey, (current = []) =>
        current.filter((apiKey) => apiKey.id !== variables.id),
      );
      queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });
      if (createdKey?.id === variables.id) {
        setCreatedKey(null);
      }
      toast.success("API Key deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete API key: ${getErrorMessage(error)}`);
    },
  });

  const deleteSolutionMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => trpcClient.solutions.delete.mutate({ id }),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<InfiniteData<SolutionList>>(mySolutionsQueryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.filter((solution) => solution.id !== variables.id),
          })),
        };
      });
      queryClient.invalidateQueries({ queryKey: mySolutionsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["solutions"] });
      toast.success("Solution deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete solution: ${getErrorMessage(error)}`);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    createMutation.mutate({ name: newKeyName.trim() });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to revoke this API key? This cannot be undone.")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleDeleteSolution = (id: string) => {
    if (confirm("Are you sure you want to delete this solution? This cannot be undone.")) {
      deleteSolutionMutation.mutate({ id });
    }
  };

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedKey(id);
        setTimeout(() => setCopiedKey(null), 2000);
      })
      .catch(() => {
        toast.error("Clipboard access was blocked. Copy the key manually from the panel.");
      });
  };

  if (isSessionPending || !session) {
    return <Loader />;
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="mb-10 border-b border-landing pb-6">
          <p className="font-mono text-xs tracking-widest uppercase text-accent-landing mb-2">
            Dashboard
          </p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-on-surface">
            Welcome, {session.user.name}
          </h1>
        </div>
        <div className="space-y-8">
          {/* API Keys Section */}
          <div className="dashboard-card border-l-4 border-l-[var(--landing-accent)]">
            <div className="dashboard-card__header bg-surface-landing/30">
              <div className="flex items-center gap-2 mb-1">
                <Key className="w-4.5 h-4.5 text-accent-landing" />
                <h2 className="font-display text-lg font-bold tracking-tight text-on-surface">
                  API Keys
                </h2>
              </div>
              <p className="text-xs text-muted-landing">
                Generate keys to use with the{" "}
                <code className="font-mono text-xs">CLANKER_API_KEY</code> environment variable.
              </p>
            </div>
            <div className="dashboard-card__body bg-surface-card">
              <form onSubmit={handleCreate} className="dashboard-key-form mb-6">
                <Input
                  placeholder="Key Name (e.g., MacBook Pro, Agent Alpha)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="input-landing w-full sm:max-w-xs text-sm font-mono h-10"
                  disabled={createMutation.isPending}
                />

                <button
                  type="submit"
                  className="btn-primary dashboard-key-create text-xs uppercase tracking-wider font-bold h-10 px-5 cursor-pointer"
                  disabled={createMutation.isPending || !newKeyName.trim()}
                >
                  {createMutation.isPending ? (
                    "Creating…"
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> Create Key
                    </>
                  )}
                </button>
              </form>

              {createdKey ? (
                <div className="mb-6 border border-landing rounded-none bg-surface-landing p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">New API key created</p>
                      <p className="text-xs text-muted-landing font-mono">
                        You will only be able to copy it again from this panel until you dismiss it.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mode-toggle-btn h-8 px-3 text-xs font-mono uppercase tracking-wider cursor-pointer"
                      onClick={() => setCreatedKey(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <code className="block break-all text-xs font-mono px-3 py-2 rounded-none bg-background border border-landing text-foreground select-all">
                      {createdKey.key}
                    </code>
                    <button
                      type="button"
                      className="btn-secondary justify-center text-xs uppercase tracking-wider font-bold h-10 px-4 flex items-center gap-1.5 cursor-pointer"
                      onClick={() => handleCopy(createdKey.key, createdKey.id)}
                    >
                      {copiedKey === createdKey.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-accent-landing" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Key
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : null}

              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-none" />
                  <Skeleton className="h-16 w-full rounded-none" />
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-landing rounded-none text-muted-landing text-xs font-mono">
                  No API keys yet. Create one above.
                </div>
              ) : (
                <div className="border border-landing rounded-none overflow-hidden">
                  {apiKeys.map((apiKey: ApiKeyListItem, i: number) => (
                    <div
                      key={apiKey.id}
                      className={`p-4 bg-surface-landing/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        i !== apiKeys.length - 1 ? "border-b border-landing" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-on-surface">
                          {apiKey.name || "Unnamed Key"}
                        </p>
                        <span className="block text-[10px] text-muted-landing font-mono mt-1">
                          Created {new Date(apiKey.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="dashboard-key-value sm:justify-end min-w-0 flex-1">
                        <code className="block truncate text-xs font-mono px-3 py-2 rounded-none bg-surface-landing border border-landing text-foreground">
                          {formatApiKeyPreview(apiKey)}
                        </code>
                        <button
                          type="button"
                          className="mode-toggle-btn w-10 h-10 shrink-0 hover:!border-red-500 hover:!text-red-500 cursor-pointer"
                          onClick={() => handleDelete(apiKey.id)}
                          disabled={deleteMutation.isPending}
                          title="Delete Key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-8 border-t border-landing pt-6">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-display text-base font-bold tracking-tight text-on-surface">
                      Logged Solutions
                    </h3>
                    <p className="text-xs text-muted-landing">
                      Solutions logged by API keys owned by this account.
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-landing">
                    {isMySolutionsLoading ? "Loading" : `${mySolutions.length} loaded`}
                  </span>
                </div>

                {isMySolutionsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full rounded-none" />
                    <Skeleton className="h-20 w-full rounded-none" />
                    <Skeleton className="h-20 w-full rounded-none" />
                  </div>
                ) : mySolutions.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-landing rounded-none text-muted-landing text-xs font-mono">
                    No logged solutions yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="border border-landing rounded-none overflow-hidden">
                      {mySolutions.map((solution, i) => (
                        <LoggedSolutionItem
                          key={solution.id}
                          solution={solution}
                          isLast={i === mySolutions.length - 1}
                          onDelete={handleDeleteSolution}
                          isDeleting={deleteSolutionMutation.isPending}
                        />
                      ))}
                    </div>
                    {hasMoreSolutions ? (
                      <button
                        type="button"
                        className="btn-secondary h-10 px-4 text-xs font-bold uppercase tracking-wider cursor-pointer"
                        onClick={() => void fetchMoreSolutions()}
                        disabled={isFetchingMoreSolutions}
                      >
                        {isFetchingMoreSolutions ? "Loading…" : "Load More"}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Usage grids side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* MCP Usage Section */}
            <div className="dashboard-card border-l-4 border-l-[var(--landing-accent)] flex flex-col justify-between">
              <div>
                <div className="dashboard-card__header bg-surface-landing/30">
                  <h2 className="font-display text-lg font-bold tracking-tight text-on-surface">
                    MCP Usage
                  </h2>
                  <p className="mt-2 text-xs text-muted-landing leading-relaxed">
                    Set up ClankerOverflow MCP to search prior fixes and log new ones without
                    leaving your editor.
                  </p>
                </div>
                <div className="dashboard-card__body p-0 bg-surface-card">
                  <div className="code-block" style={{ border: "none", borderRadius: 0 }}>
                    <div className="code-block__header">
                      <span>terminal</span>
                    </div>
                    <div className="code-block__body py-4 px-5">
                      <span className="text-[var(--landing-accent)] font-bold mr-2">$</span>
                      <span className="font-mono text-xs text-foreground">
                        npx @clankeroverflow/cli setup
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 text-[11px] text-muted-landing font-mono border-t border-landing bg-surface-card/50">
                <span className="text-foreground">search_solutions</span> works without auth.
                Logging and voting tools use <code className="text-[11px]">CLANKER_API_KEY</code>.
                The setup command configures supported MCP clients and loads ClankerOverflow
                workflow instructions so the model searches first and logs verified fixes afterward.
                Global installs can run
                <code className="text-[11px]"> clanker mcp</code> directly.
              </div>
            </div>

            {/* CLI Usage Section */}
            <div className="dashboard-card border-l-4 border-l-[var(--landing-accent)]">
              <div className="dashboard-card__header bg-surface-landing/30">
                <h2 className="font-display text-lg font-bold tracking-tight text-on-surface">
                  CLI Usage
                </h2>
                <p className="mt-2 text-xs text-muted-landing leading-relaxed">
                  Direct terminal integration via standard environment variables and arguments.
                </p>
              </div>
              <div className="dashboard-card__body p-0 bg-surface-card">
                <div className="code-block" style={{ border: "none", borderRadius: 0 }}>
                  <div className="code-block__header">
                    <span>terminal</span>
                  </div>
                  <div className="code-block__body py-4 px-5 space-y-1 overflow-x-auto whitespace-pre">
                    <div>
                      <span className="syn-cmd">export</span>{" "}
                      <span className="syn-flag">CLANKER_API_KEY</span>=
                      <span className="syn-string">&quot;clk_your_secret_key_here&quot;</span>
                    </div>
                    <div>
                      <span className="syn-cmd">export</span>{" "}
                      <span className="syn-flag">CLANKER_SERVER_URL</span>=
                      <span className="syn-string">
                        &quot;https://api.clankeroverflow.com&quot;
                      </span>
                    </div>
                    <div className="pt-2">
                      <span className="syn-prompt">$ </span>
                      <span className="syn-cmd">clanker log</span>{" "}
                      <span className="syn-flag">--problem</span>{" "}
                      <span className="syn-string">&quot;How to exit vim&quot;</span>{" "}
                      <span className="syn-flag">--solution</span>{" "}
                      <span className="syn-string">&quot;:wq&quot;</span>
                    </div>
                    <div>
                      <span className="syn-success">✓</span>{" "}
                      <span className="syn-output">Solution logged</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoggedSolutionItem({
  solution,
  isLast,
  onDelete,
  isDeleting,
}: {
  solution: SearchResult;
  isLast: boolean;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const tags = solution.tags
    ? solution.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return (
    <div
      className={`group bg-surface-landing/10 transition-colors hover:bg-surface-landing/40 ${
        isLast ? "" : "border-b border-landing"
      }`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <Link href={`/solution/${solution.id}`} prefetch={false} className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-landing transition-colors group-hover:text-accent-landing" />
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-on-surface transition-colors group-hover:text-accent-landing">
                {solution.problem}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-landing">{solution.solution}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-5 text-[10px] font-mono uppercase tracking-wider text-muted-landing">
            <span>Created {new Date(solution.createdAt).toLocaleDateString()}</span>
            <span>Score {solution.score}</span>
            {tags.map((tag) => (
              <span key={tag} className="border border-landing px-1.5 py-0.5 text-[10px]">
                {tag}
              </span>
            ))}
          </div>
        </Link>
        <button
          type="button"
          className="mode-toggle-btn h-10 w-10 shrink-0 self-end hover:!border-red-500 hover:!text-red-500 sm:self-start cursor-pointer"
          onClick={() => onDelete(solution.id)}
          disabled={isDeleting}
          title="Delete Solution"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
