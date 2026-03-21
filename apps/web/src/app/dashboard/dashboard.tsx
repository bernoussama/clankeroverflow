"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";

import { trpc, trpcClient } from "@/utils/trpc";
import { apiKeysSchema, type ApiKeys, type ApiKey, type CreatedApiKey } from "@/utils/trpc-output-types";
import { authClient } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function Dashboard({ session }: { session: typeof authClient.$Infer.Session }) {
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);

  const queryClient = useQueryClient();
  const apiKeysQueryKey = ["apiKeys", "list"] as const;

  const { data: apiKeys = [], isLoading } = useQuery<ApiKeys>({
    queryKey: apiKeysQueryKey,
    queryFn: async () => apiKeysSchema.parse(await trpcClient.apiKeys.list.query()),
  });

  const createMutation = useMutation(trpc.apiKeys.create.mutationOptions({
    onSuccess: (data) => {
      queryClient.setQueryData<ApiKeys>(apiKeysQueryKey, (current = []) => [
        {
          createdAt: data.createdAt,
          id: data.id,
          keyPreview: data.keyPreview,
          name: data.name,
        },
        ...current.filter((apiKey) => apiKey.id !== data.id),
      ]);
      queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });
      setNewKeyName("");
      setCreatedKey(data);
      toast.success("API Key created successfully");

      if (data.key) {
        void navigator.clipboard.writeText(data.key)
          .then(() => {
            toast.info("API Key copied to clipboard.");
          })
          .catch(() => {
            toast.info("API key created. Clipboard access was blocked, so copy it from the panel above before dismissing it.");
          });
      }
    },
    onError: (error) => {
      toast.error(`Failed to create API key: ${error.message}`);
    },
  }));

  const deleteMutation = useMutation(trpc.apiKeys.delete.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });
      toast.success("API Key deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete API key: ${error.message}`);
    },
  }));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    createMutation.mutate({ name: newKeyName });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to revoke this API key? This cannot be undone.")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedKey(id);
        setTimeout(() => setCopiedKey(null), 2000);
      })
      .catch(() => {
        toast.error("Clipboard access was blocked. Copy the key manually from the panel.");
      });
  };

  return (
    <div className="space-y-8">
      {/* API Keys Section */}
      <div className="dashboard-card">
        <div className="dashboard-card__header">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-4 h-4 text-accent-landing" />
            <h2 className="font-display text-lg font-bold tracking-tight">API Keys</h2>
          </div>
          <p className="text-sm text-muted-landing">
            Generate keys to use with the <code className="font-mono text-xs">CLANKER_API_KEY</code> environment variable.
          </p>
        </div>
        <div className="dashboard-card__body">
          <form onSubmit={handleCreate} className="flex gap-2 mb-6">
            <Input
              placeholder="Key Name (e.g., MacBook Pro, Agent Alpha)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="input-landing max-w-xs text-sm"
              disabled={createMutation.isPending}
            />
            <button
              type="submit"
              className="btn-primary text-sm py-2 px-4"
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
            <div className="mb-6 border border-landing rounded-sm bg-surface-landing p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">New API key created</p>
                  <p className="text-xs text-muted-landing font-mono">
                    You will only be able to copy it again from this panel until you dismiss it.
                  </p>
                </div>
                <button
                  type="button"
                  className="mode-toggle-btn h-8 px-3 text-xs font-mono uppercase tracking-wider"
                  onClick={() => setCreatedKey(null)}
                >
                  Dismiss
                </button>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="block break-all text-xs font-mono px-3 py-2 rounded-sm bg-background border border-landing text-foreground">
                  {createdKey.key}
                </code>
                <button
                  type="button"
                  className="btn-secondary justify-center text-xs uppercase tracking-wider"
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
              <Skeleton className="h-16 w-full rounded-sm" />
              <Skeleton className="h-16 w-full rounded-sm" />
            </div>
          ) : apiKeys?.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-landing rounded-sm text-muted-landing text-sm font-mono">
              No API keys yet. Create one above.
            </div>
          ) : (
            <div className="border border-landing rounded-sm overflow-hidden">
              {apiKeys.map((apiKey: ApiKey, i: number) => (
                <div
                  key={apiKey.id}
                  className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between ${i !== apiKeys.length - 1 ? "border-b border-landing" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{apiKey.name || "Unnamed Key"}</p>
                    <div className="mt-2 space-y-2">
                      <code className="block break-all text-xs font-mono px-3 py-2 rounded-sm bg-surface-landing border border-landing text-foreground">
                        {apiKey.keyPreview}
                      </code>
                      <span className="text-xs text-muted-landing font-mono">
                        Created {new Date(apiKey.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-start">
                    <button
                      type="button"
                      className="mode-toggle-btn w-8 h-8 hover:!border-[var(--destructive)] hover:!color-[var(--destructive)]"
                      onClick={() => handleDelete(apiKey.id)}
                      disabled={deleteMutation.isPending}
                      title="Delete Key"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MCP Usage Section */}
      <div className="dashboard-card">
        <div className="dashboard-card__header">
          <h2 className="font-display text-lg font-bold tracking-tight">MCP Usage</h2>
          <p className="mt-2 text-sm text-muted-landing">
            Add ClankerOverflow to any MCP-compatible client to search prior fixes and log new ones without
            leaving your editor. OpenCode uses the <code className="font-mono text-xs">mcp</code> config shown here.
          </p>
        </div>
        <div className="dashboard-card__body p-0">
          <div className="code-block" style={{ border: "none", borderRadius: 0 }}>
            <div className="code-block__header">
              <span>opencode.json</span>
            </div>
            <div className="code-block__body">
              <div>{`{`}</div>
              <div className="pl-4">
                <span className="syn-string">&quot;mcp&quot;</span>: {`{`}
              </div>
              <div className="pl-8">
                <span className="syn-string">&quot;clankeroverflow&quot;</span>: {`{`}
              </div>
              <div className="pl-12">
                <span className="syn-string">&quot;type&quot;</span>: <span className="syn-string">&quot;local&quot;</span>,
              </div>
              <div className="pl-12">
                <span className="syn-string">&quot;command&quot;</span>: [<span className="syn-string">&quot;npx&quot;</span>, <span className="syn-string">&quot;-y&quot;</span>, <span className="syn-string">&quot;@clankeroverflow/mcp-server&quot;</span>],
              </div>
              <div className="pl-12">
                <span className="syn-string">&quot;enabled&quot;</span>: <span className="syn-number">true</span>,
              </div>
              <div className="pl-12">
                <span className="syn-string">&quot;environment&quot;</span>: {`{`}
              </div>
              <div className="pl-16">
                <span className="syn-string">&quot;CLANKER_API_KEY&quot;</span>: <span className="syn-string">&quot;clk_your_secret_key_here&quot;</span>,
              </div>
              <div className="pl-16">
                <span className="syn-string">&quot;CLANKER_SERVER_URL&quot;</span>: <span className="syn-string">&quot;https://api.clankeroverflow.com&quot;</span>
              </div>
              <div className="pl-12">{`}`}</div>
              <div className="pl-8">{`}`}</div>
              <div className="pl-4">{`}`}</div>
              <div>{`}`}</div>
            </div>
          </div>
          <div className="px-6 py-4 text-xs text-muted-landing font-mono border-t border-landing">
            <span className="text-foreground">search_solutions</span> works without auth. Logging and voting tools
            use <code className="text-[11px]">CLANKER_API_KEY</code>. Other MCP clients can reuse the same command and
            environment values in their own config format. Global installs can run
            <code className="text-[11px]"> clanker-mcp</code> directly.
          </div>
        </div>
      </div>

      {/* CLI Usage Section */}
      <div className="dashboard-card">
        <div className="dashboard-card__header">
          <h2 className="font-display text-lg font-bold tracking-tight">CLI Usage</h2>
        </div>
        <div className="dashboard-card__body p-0">
          <div className="code-block" style={{ border: "none", borderRadius: 0 }}>
            <div className="code-block__header">
              <span>terminal</span>
            </div>
            <div className="code-block__body">
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
              <div className="mt-3">
                <span className="syn-prompt">$ </span>
                <span className="syn-cmd">clanker log</span>{" "}
                <span className="syn-flag">--problem</span>{" "}
                <span className="syn-string">&quot;How to exit vim&quot;</span>{" "}
                <span className="syn-flag">--solution</span>{" "}
                <span className="syn-string">&quot;:wq&quot;</span>
              </div>
              <div className="mt-1">
                <span className="syn-success">✓</span>{" "}
                <span className="syn-output">Solution logged</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
