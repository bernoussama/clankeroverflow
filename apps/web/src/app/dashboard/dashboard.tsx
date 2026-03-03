"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";

import { trpc } from "@/utils/trpc";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function Dashboard({ session }: { session: typeof authClient.$Infer.Session }) {
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  const queryClient = useQueryClient();

  const { data: apiKeys, isLoading } = useQuery(trpc.apiKeys.list.queryOptions());

  const createMutation = useMutation(trpc.apiKeys.create.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries(trpc.apiKeys.list.pathFilter());
      setNewKeyName("");
      toast.success("API Key created successfully");
      
      // Auto-copy the new key to clipboard since it's the only time they'll see it
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
          <form onSubmit={handleCreate} className="flex gap-2 mb-8">
            <Input
              placeholder="Key Name (e.g., MacBook Pro, Agent Alpha)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="max-w-xs"
              disabled={createMutation.isPending}
            />
            <Button type="submit" disabled={createMutation.isPending || !newKeyName.trim()}>
              {createMutation.isPending ? "Creating..." : <><Plus className="w-4 h-4 mr-2" /> Create Key</>}
            </Button>
          </form>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : apiKeys?.length === 0 ? (
            <div className="text-center p-6 border border-dashed rounded-lg bg-muted/20 text-muted-foreground">
              You haven't created any API keys yet.
            </div>
          ) : (
            <div className="rounded-md border">
              {apiKeys?.map((apiKey, i) => (
                <div 
                  key={apiKey.id} 
                  className={`flex items-center justify-between p-4 ${i !== apiKeys.length - 1 ? 'border-b' : ''}`}
                >
                  <div>
                    <p className="font-medium">{apiKey.name || "Unnamed Key"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">
                        {apiKey.key.substring(0, 8)}...{apiKey.key.substring(apiKey.key.length - 4)}
                      </code>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(apiKey.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleCopy(apiKey.key, apiKey.id)}
                      title="Copy Key"
                    >
                      {copiedKey === apiKey.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(apiKey.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
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