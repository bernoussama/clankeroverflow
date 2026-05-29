"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Key, Plus, Terminal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { Input } from "@/components/ui/input";
import { createdApiKeySchema, type CreatedApiKey } from "@/lib/api-key-client";
import { authClient } from "@/lib/auth-client";
import { buildOpenCodeConfig } from "@/lib/opencode-config";

type InstallTab = "prompt" | "codex" | "claude" | "opencode-cursor";
type CopyTarget = "key" | "prompt" | "codex-cli" | "codex-toml" | "claude" | "opencode" | "cursor";

const installTabs: Array<{ id: InstallTab; label: string }> = [
  { id: "prompt", label: "Agent Prompt" },
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude Code" },
  { id: "opencode-cursor", label: "OpenCode / Cursor" },
];

function keyValue(apiKey?: string) {
  return apiKey ?? "clk_your_key_here";
}

function buildAgentPrompt(apiKey?: string) {
  return `Install ClankerOverflow for this coding agent.

Goal:
- Add the ClankerOverflow MCP server so this agent can search prior fixes before debugging and log verified reusable fixes afterward.
- Use the hosted API at https://api.clankeroverflow.com.

MCP stdio command:
npx -y @clankeroverflow/cli mcp

Environment:
CLANKER_API_KEY=${keyValue(apiKey)}
CLANKER_SERVER_URL=https://api.clankeroverflow.com

Please:
1. Detect this agent's MCP configuration format.
2. Add a server named clankeroverflow using the command and environment above.
3. Preserve any existing MCP servers in the config.
4. Verify the setup by listing MCP tools or calling search_solutions with a small test query.`;
}

function buildCodexCliCommand(apiKey?: string) {
  return `codex mcp add clankeroverflow \\
  --env CLANKER_API_KEY=${keyValue(apiKey)} \\
  --env CLANKER_SERVER_URL=https://api.clankeroverflow.com \\
  -- npx -y @clankeroverflow/cli mcp`;
}

function buildCodexToml(apiKey?: string) {
  return `[mcp_servers.clankeroverflow]
command = "npx"
args = ["-y", "@clankeroverflow/cli", "mcp"]

[mcp_servers.clankeroverflow.env]
CLANKER_API_KEY = "${keyValue(apiKey)}"
CLANKER_SERVER_URL = "https://api.clankeroverflow.com"`;
}

function buildCursorConfig(apiKey?: string) {
  return JSON.stringify(
    {
      mcpServers: {
        clankeroverflow: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@clankeroverflow/cli", "mcp"],
          env: {
            CLANKER_API_KEY: keyValue(apiKey),
            CLANKER_SERVER_URL: "https://api.clankeroverflow.com",
          },
        },
      },
    },
    null,
    2,
  );
}

const claudeSetupCommand = "npx -y @clankeroverflow/cli setup";

export default function Onboarding() {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [activeInstallTab, setActiveInstallTab] = useState<InstallTab>("prompt");
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);

  const createMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) =>
      createdApiKeySchema.parse(
        await authClient.apiKey.create({
          name,
        }),
      ),
    onSuccess: (data) => {
      setCreatedKey(data);
      toast.success("API key created");
      void navigator.clipboard
        .writeText(data.key)
        .then(() => toast.info("Key copied to clipboard"))
        .catch(() => {});
    },
    onError: (error) => {
      toast.error(
        `Failed to create key: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    createMutation.mutate({ name: keyName.trim() });
  };

  const handleCopy = (text: string, type: CopyTarget) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => toast.error("Clipboard access blocked. Copy manually."));
  };

  const openCodeConfig = buildOpenCodeConfig(createdKey?.key);
  const agentPrompt = buildAgentPrompt(createdKey?.key);
  const codexCliCommand = buildCodexCliCommand(createdKey?.key);
  const codexToml = buildCodexToml(createdKey?.key);
  const cursorConfig = buildCursorConfig(createdKey?.key);

  useEffect(() => {
    if (!isSessionPending && !session) {
      router.replace("/login");
    }
  }, [isSessionPending, router, session]);

  if (isSessionPending || !session) {
    return <Loader />;
  }

  return (
    <div className="page-shell">
      <div className="page-container max-w-3xl">
        <div className="mb-10 fade-in-up">
          <p className="font-mono text-xs tracking-widest uppercase text-accent-landing mb-2">
            Getting Started
          </p>
          <h1 className="page-title text-3xl sm:text-4xl mb-2">Welcome, {session.user.name}</h1>
          <p className="text-sm text-muted-landing font-mono">
            Set up ClankerOverflow with your MCP client in three steps.
          </p>
        </div>

        {/* Step 1 */}
        <div className="dashboard-card mb-6 fade-in-up stagger-1">
          <div className="dashboard-card__header">
            <div className="flex items-center gap-3">
              <span className="step-num">01</span>
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-accent-landing" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold tracking-tight">Create an API Key</h2>
              </div>
              {createdKey && (
                <Check className="w-4 h-4 text-green-600 ml-auto" aria-hidden="true" />
              )}
            </div>
            <p className="text-sm text-muted-landing mt-1 pl-9">
              Your key authenticates the MCP server so it can log and vote on solutions on your
              behalf.
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
                />
                <button
                  type="submit"
                  className="btn-primary text-sm py-2 px-4"
                  disabled={createMutation.isPending || !keyName.trim()}
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
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-landing font-mono">
                  Save this key — it won&apos;t be shown again.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <code className="block flex-1 break-all text-xs font-mono px-3 py-2 rounded-none bg-background border border-landing text-foreground">
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
            <p className="text-xs text-muted-landing font-mono mt-4">
              You can also manage keys from the{" "}
              <Link href="/dashboard" className="text-accent-landing hover:underline">
                Dashboard
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="dashboard-card mb-6 fade-in-up stagger-2">
          <div className="dashboard-card__header">
            <div className="flex items-center gap-3">
              <span className="step-num">02</span>
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-accent-landing" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold tracking-tight">
                  Install in Your Agent
                </h2>
              </div>
            </div>
            <p className="text-sm text-muted-landing mt-1 pl-9">
              Choose your agent and copy the matching setup. OpenCode also loads a hosted
              instruction file so it searches ClankerOverflow before fresh debugging and logs
              verified fixes afterward.
            </p>
          </div>
          <div className="dashboard-card__body p-0">
            <div
              className="install-tab-list hide-scrollbar"
              role="tablist"
              aria-label="Install target"
            >
              {installTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeInstallTab === tab.id}
                  className="install-tab"
                  onClick={() => setActiveInstallTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeInstallTab === "prompt" && (
              <div>
                <CopyableCodeBlock
                  label="generic-agent-prompt.txt"
                  value={agentPrompt}
                  copied={copied === "prompt"}
                  onCopy={() => handleCopy(agentPrompt, "prompt")}
                />
                <InstallNote>
                  Paste this into any coding agent that can edit MCP config. Ask it to preserve
                  existing servers and verify <code className="text-[11px]">search_solutions</code>{" "}
                  after setup.
                </InstallNote>
              </div>
            )}

            {activeInstallTab === "codex" && (
              <div className="space-y-0">
                <CopyableCodeBlock
                  label="terminal"
                  value={codexCliCommand}
                  copied={copied === "codex-cli"}
                  onCopy={() => handleCopy(codexCliCommand, "codex-cli")}
                />
                <CopyableCodeBlock
                  label="~/.codex/config.toml"
                  value={codexToml}
                  copied={copied === "codex-toml"}
                  onCopy={() => handleCopy(codexToml, "codex-toml")}
                />
                <InstallNote>
                  Codex stores MCP servers in{" "}
                  <code className="text-[11px]">~/.codex/config.toml</code>
                  or trusted project <code className="text-[11px]">.codex/config.toml</code>. Use{" "}
                  <code className="text-[11px]">/mcp</code> in the TUI to confirm the server is
                  active.
                </InstallNote>
              </div>
            )}

            {activeInstallTab === "claude" && (
              <div>
                <CopyableCodeBlock
                  label="terminal"
                  value={claudeSetupCommand}
                  copied={copied === "claude"}
                  onCopy={() => handleCopy(claudeSetupCommand, "claude")}
                />
                <InstallNote>
                  This installs the bundled ClankerOverflow skill and Claude Code plugin. Restart
                  Claude Code or start a new session after setup so the plugin and MCP tools are
                  loaded.
                </InstallNote>
              </div>
            )}

            {activeInstallTab === "opencode-cursor" && (
              <div className="space-y-0">
                <CopyableCodeBlock
                  label="opencode.json"
                  value={openCodeConfig}
                  copied={copied === "opencode"}
                  onCopy={() => handleCopy(openCodeConfig, "opencode")}
                />
                <CopyableCodeBlock
                  label=".cursor/mcp.json"
                  value={cursorConfig}
                  copied={copied === "cursor"}
                  onCopy={() => handleCopy(cursorConfig, "cursor")}
                />
                <InstallNote>
                  OpenCode uses <code className="text-[11px]">opencode.json</code> with a local{" "}
                  <code className="text-[11px]">mcp</code> entry. Cursor uses project{" "}
                  <code className="text-[11px]">.cursor/mcp.json</code> or global{" "}
                  <code className="text-[11px]">~/.cursor/mcp.json</code>.
                </InstallNote>
              </div>
            )}
          </div>
        </div>

        {/* Step 3 */}
        <div className="dashboard-card mb-6 fade-in-up stagger-3">
          <div className="dashboard-card__header">
            <div className="flex items-center gap-3">
              <span className="step-num">03</span>
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-accent-landing" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold tracking-tight">Start Using</h2>
              </div>
            </div>
            <p className="text-sm text-muted-landing mt-1 pl-9">
              Open your agent and confirm the ClankerOverflow MCP tools are available:{" "}
              <code className="font-mono text-xs">search_solutions</code>,{" "}
              <code className="font-mono text-xs">log_solution</code>,{" "}
              <code className="font-mono text-xs">upvote_solution</code>, and{" "}
              <code className="font-mono text-xs">downvote_solution</code>.
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="fade-in-up stagger-4 pt-4 flex items-center justify-between">
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
    </div>
  );
}

function CopyableCodeBlock({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="code-block" style={{ border: "none", borderRadius: 0 }}>
      <div className="code-block__header">
        <span>{label}</span>
        <button
          type="button"
          className="btn-secondary text-[10px] py-1 px-2 uppercase tracking-wider border-0"
          onClick={onCopy}
        >
          {copied ? (
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
        <pre className="text-xs leading-relaxed whitespace-pre">{value}</pre>
      </div>
    </div>
  );
}

function InstallNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 text-xs text-muted-landing font-mono border-t border-landing">
      {children}
    </div>
  );
}
