"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";
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
                <h2 className="font-display text-lg font-bold tracking-tight text-on-surface">API Keys</h2>
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
                        <p className="text-sm font-semibold text-on-surface">{apiKey.name || "Unnamed Key"}</p>
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
            </div>
          </div>

          {/* Usage grids side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* MCP Usage Section */}
            <div className="dashboard-card border-l-4 border-l-[var(--landing-accent)] flex flex-col justify-between">
              <div>
                <div className="dashboard-card__header bg-surface-landing/30">
                  <h2 className="font-display text-lg font-bold tracking-tight text-on-surface">MCP Usage</h2>
                  <p className="mt-2 text-xs text-muted-landing leading-relaxed">
                    Set up ClankerOverflow MCP to search prior fixes and log new ones without leaving
                    your editor.
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
                <h2 className="font-display text-lg font-bold tracking-tight text-on-surface">CLI Usage</h2>
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
                      <span className="syn-string">&quot;https://api.clankeroverflow.com&quot;</span>
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
