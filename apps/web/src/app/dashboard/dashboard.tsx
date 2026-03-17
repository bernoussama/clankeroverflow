"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";

import { trpc, trpcClient } from "@/utils/trpc";
import { apiKeysSchema, type ApiKeys, type ApiKey } from "@/utils/trpc-output-types";
import { authClient } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function Dashboard({ session }: { session: typeof authClient.$Infer.Session }) {
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  const queryClient = useQueryClient();

  const { data: apiKeys = [], isLoading } = useQuery<ApiKeys>({
    queryKey: ["apiKeys", "list"],
    queryFn: async () => apiKeysSchema.parse(await trpcClient.apiKeys.list.query()),
  });

  const createMutation = useMutation(trpc.apiKeys.create.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries(trpc.apiKeys.list.pathFilter());
      setNewKeyName("");
      toast.success("API Key created successfully");
      
      if (data.key) {
        navigator.clipboard.writeText(data.key);
        toast.info("API Key copied to clipboard! Save it now, you won't be able to see it again.");
      }
    },
    onError: (error) => {
      toast.error(`Failed to create API key: ${error.message}`);
    },
  }));

  const deleteMutation = useMutation(trpc.apiKeys.delete.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.apiKeys.list.pathFilter());
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
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
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
                  className={`flex items-center justify-between p-4 ${i !== apiKeys.length - 1 ? "border-b border-landing" : ""}`}
                >
                  <div>
                    <p className="text-sm font-semibold">{apiKey.name || "Unnamed Key"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs font-mono px-2 py-0.5 rounded-sm bg-surface-landing border border-landing text-muted-landing">
                        {apiKey.key.substring(0, 8)}…{apiKey.key.substring(apiKey.key.length - 4)}
                      </code>
                      <span className="text-xs text-muted-landing font-mono">
                        Created {new Date(apiKey.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="mode-toggle-btn w-8 h-8"
                      onClick={() => handleCopy(apiKey.key, apiKey.id)}
                      title="Copy Key"
                    >
                      {copiedKey === apiKey.id ? (
                        <Check className="w-3.5 h-3.5 text-accent-landing" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
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
                <span className="syn-string">&quot;https://your-server.example.com&quot;</span>
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
