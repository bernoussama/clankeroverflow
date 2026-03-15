"use client";

import { useState, useEffect, useCallback } from "react";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function Dashboard({ userName }: { userName: string }) {
  const [newKeyName, setNewKeyName] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedNewKey, setCopiedNewKey] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    const { data, error } = await authClient.apiKey.list();
    if (!error && data) {
      setApiKeys(data.apiKeys);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setIsCreating(true);
    setNewlyCreatedKey(null);
    const { data, error } = await authClient.apiKey.create({ name: newKeyName });
    setIsCreating(false);

    if (error) {
      toast.error(`Failed to create API key: ${error.message}`);
      return;
    }

    setNewKeyName("");
    setNewlyCreatedKey(data.key);
    setCopiedNewKey(false);
    toast.success("API Key created — copy it now, you won't see it again.");
    fetchKeys();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This cannot be undone.")) return;

    setIsDeleting(id);
    const { error } = await authClient.apiKey.delete({ keyId: id });
    setIsDeleting(null);

    if (error) {
      toast.error(`Failed to delete API key: ${error.message}`);
      return;
    }

    toast.success("API Key deleted successfully");
    fetchKeys();
  };

  const handleCopyNewKey = async () => {
    if (!newlyCreatedKey) return;
    try {
      await navigator.clipboard.writeText(newlyCreatedKey);
      setCopiedNewKey(true);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy — please select and copy manually");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Clanker CLI Settings</h2>
        <p className="text-muted-foreground mb-6">
          Manage your API keys. You need an API key to authenticate the Clanker CLI so that the solutions you log are attributed to your account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" /> API Keys
          </CardTitle>
          <CardDescription>
            Generate keys to use with the `CLANKER_API_KEY` environment variable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex gap-2 mb-4">
            <Input
              placeholder="Key Name (e.g., MacBook Pro, Agent Alpha)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="max-w-xs"
              disabled={isCreating}
            />
            <Button type="submit" disabled={isCreating || !newKeyName.trim()}>
              {isCreating ? "Creating..." : <><Plus className="w-4 h-4 mr-2" /> Create Key</>}
            </Button>
          </form>

          {newlyCreatedKey && (
            <div className="mb-8 p-4 border border-yellow-500/50 bg-yellow-500/10 rounded-md">
              <p className="text-sm font-semibold mb-2">
                Your new API key (shown only once):
              </p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-3 py-2 rounded font-mono flex-1 break-all select-all">
                  {newlyCreatedKey}
                </code>
                <Button variant="ghost" size="icon" onClick={handleCopyNewKey}>
                  {copiedNewKey ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Save this key securely. It cannot be retrieved after you leave this page.
              </p>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center p-6 border border-dashed rounded-lg bg-muted/20 text-muted-foreground">
              You haven't created any API keys yet.
            </div>
          ) : (
            <div className="rounded-md border">
              {apiKeys.map((apiKey, i) => (
                <div
                  key={apiKey.id}
                  className={`flex items-center justify-between p-4 ${i !== apiKeys.length - 1 ? 'border-b' : ''}`}
                >
                  <div>
                    <p className="font-medium">{apiKey.name || "Unnamed Key"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">
                        {apiKey.start ?? "clk_****"}...
                      </code>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(apiKey.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDelete(apiKey.id)}
                    disabled={isDeleting === apiKey.id}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CLI Usage Example</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-md">
            <pre className="text-sm font-mono overflow-x-auto text-muted-foreground">
              <span className="text-primary">export</span> CLANKER_API_KEY="clk_your_secret_key_here"<br />
              <span className="text-primary">export</span> CLANKER_SERVER_URL="http://localhost:3000"<br />
              <br />
              clanker log --problem "How to exit vim" --solution ":wq"
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
