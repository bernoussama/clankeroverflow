"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Key, Terminal } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { trpc } from "@/utils/trpc";
import type { CreatedApiKey } from "@/utils/trpc-output-types";

export default function Onboarding({ userName }: { userName: string }) {
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState<"key" | "config" | null>(null);

  const createMutation = useMutation(
    trpc.apiKeys.create.mutationOptions({
      onSuccess: (data) => {
        setCreatedKey(data);
        toast.success("API key created");
        void navigator.clipboard
          .writeText(data.key)
          .then(() => toast.info("Key copied to clipboard"))
          .catch(() => {});
      },
      onError: (error) => {
        toast.error(`Failed to create key: ${error.message}`);
      },
    }),
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    createMutation.mutate({ name: keyName });
  };

  const handleCopy = (text: string, type: "key" | "config") => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => toast.error("Clipboard access blocked. Copy manually."));
  };

  const openCodeConfig = createdKey
    ? JSON.stringify(
        {
          mcp: {
            clankeroverflow: {
              type: "local",
              command: ["npx", "-y", "@clankeroverflow/mcp-server"],
              enabled: true,
              environment: {
                CLANKER_API_KEY: createdKey.key,
                CLANKER_SERVER_URL: "https://api.clankeroverflow.com",
              },
            },
          },
        },
        null,
        2,
      )
    : null;

  return (
    <div>
      <div className="mb-10 fade-in-up">
        <p className="font-mono text-xs tracking-widest uppercase text-accent-landing mb-2">
          Getting Started
        </p>
        <h1 className="page-title text-3xl sm:text-4xl mb-2">Welcome, {userName}</h1>
        <p className="text-sm text-muted-landing font-mono">Set up your MCP server in two steps.</p>
      </div>

      {/* Step 1: Create API Key */}
      <div className="dashboard-card mb-6 fade-in-up stagger-1">
        <div className="dashboard-card__header">
          <div className="flex items-center gap-3">
            <span className="step-num">01</span>
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-accent-landing" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold tracking-tight">Create an API Key</h2>
            </div>
            {createdKey && <Check className="w-4 h-4 text-green-600 ml-auto" aria-hidden="true" />}
          </div>
          <p className="text-sm text-muted-landing mt-1 pl-9">
            Your key authenticates the MCP server so it can log and vote on solutions.
          </p>
        </div>
        <div className="dashboard-card__body">
          {!createdKey ? (
            <form onSubmit={handleCreate} className="flex gap-2">
              <Input
                placeholder="Key name (e.g. My Editor)"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="input-landing max-w-xs text-sm"
                disabled={createMutation.isPending}
                autoFocus
              />
              <button
                type="submit"
                className="btn-primary text-sm py-2 px-4"
                disabled={createMutation.isPending || !keyName.trim()}
              >
                {createMutation.isPending ? "Creating…" : "Create Key"}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-landing font-mono">
                Save this key — it won&apos;t be shown again.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <code className="block flex-1 break-all text-xs font-mono px-3 py-2 rounded-sm bg-background border border-landing text-foreground">
                  {createdKey.key}
                </code>
                <button
                  type="button"
                  className="btn-secondary text-xs uppercase tracking-wider"
                  onClick={() => handleCopy(createdKey.key, "key")}
                >
                  {copied === "key" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Key
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Configure MCP */}
      <div
        className={`dashboard-card mb-6 fade-in-up stagger-2 ${!createdKey ? "opacity-40 pointer-events-none" : ""}`}
      >
        <div className="dashboard-card__header">
          <div className="flex items-center gap-3">
            <span className="step-num">02</span>
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-accent-landing" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold tracking-tight">Configure OpenCode</h2>
            </div>
          </div>
          <p className="text-sm text-muted-landing mt-1 pl-9">
            Add ClankerOverflow to your <code className="font-mono text-xs">opencode.json</code>{" "}
            file.
          </p>
        </div>
        <div className="dashboard-card__body p-0">
          {openCodeConfig && (
            <>
              <div className="code-block" style={{ border: "none", borderRadius: 0 }}>
                <div className="code-block__header">
                  <span>opencode.json</span>
                  <button
                    type="button"
                    className="btn-secondary text-[10px] py-1 px-2 uppercase tracking-wider border-0"
                    onClick={() => handleCopy(openCodeConfig, "config")}
                  >
                    {copied === "config" ? (
                      <>
                        <Check className="w-3 h-3 text-green-600" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="code-block__body">
                  <pre className="text-xs leading-relaxed whitespace-pre">{openCodeConfig}</pre>
                </div>
              </div>
              <div className="px-6 py-4 text-xs text-muted-landing font-mono border-t border-landing">
                Paste this into your project&apos;s{" "}
                <code className="text-[11px]">opencode.json</code>. Your real API key is already
                filled in.
              </div>
            </>
          )}
          {!openCodeConfig && (
            <div className="px-6 py-8 text-center text-sm text-muted-landing font-mono">
              Complete step 1 to see your config.
            </div>
          )}
        </div>
      </div>

      {/* Done */}
      <div className="fade-in-up stagger-3 pt-4 flex items-center justify-between">
        <Link href="/dashboard" className="btn-primary">
          Go to Dashboard <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/solutions"
          className="text-xs font-mono text-muted-landing hover:text-accent-landing transition-colors uppercase tracking-wider"
        >
          Browse Solutions →
        </Link>
      </div>
    </div>
  );
}
