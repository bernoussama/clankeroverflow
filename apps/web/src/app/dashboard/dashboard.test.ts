import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
const openCodeConfigSource = readFileSync(
  new URL("../../lib/opencode-config.ts", import.meta.url),
  "utf8",
);

describe("dashboard API key UX", () => {
  it("reuses one user-scoped query key for loading and invalidation", () => {
    expect(dashboardSource).toContain('const apiKeysQueryKey = ["apiKeys", "list", sessionUserId] as const;');
    expect(dashboardSource).toContain("queryKey: apiKeysQueryKey");
    expect(dashboardSource).toContain("invalidateQueries({ queryKey: apiKeysQueryKey })");
  });

  it("loads and mutates keys through the Better Auth client plugin", () => {
    expect(dashboardSource).toContain("authClient.apiKey.list");
    expect(dashboardSource).toContain("authClient.apiKey.create");
    expect(dashboardSource).toContain("authClient.apiKey.delete");
    expect(dashboardSource).not.toContain("trpc.apiKeys");
    expect(dashboardSource).not.toContain("trpcClient.apiKeys");
  });

  it("keeps the freshly created API key visible when clipboard access fails", () => {
    expect(dashboardSource).toContain("const [createdKey, setCreatedKey]");
    expect(dashboardSource).toContain("setCreatedKey(data);");
    expect(dashboardSource).toContain("Clipboard access was blocked");
  });

  it("keeps persisted API keys masked while still hydrating the list cache immediately", () => {
    expect(dashboardSource).toContain("setQueryData<ApiKeyListItem[]>");
    expect(dashboardSource).toContain("start: data.start");
    expect(dashboardSource).toContain("{formatApiKeyPreview(apiKey)}");
    expect(dashboardSource).toContain(
      "You will only be able to copy it again from this panel until you dismiss it.",
    );
  });

  it("documents MCP usage before CLI usage", () => {
    expect(dashboardSource).toContain("MCP Usage");
    expect(dashboardSource).toContain("OpenCode");
    expect(dashboardSource).toContain("opencode.json");
    expect(dashboardSource).toContain("buildOpenCodeConfig");
    expect(dashboardSource).toContain("clanker-mcp");
    expect(dashboardSource).toContain("hosted ClankerOverflow workflow instructions");
    expect(dashboardSource).toContain("https://api.clankeroverflow.com");
    expect(openCodeConfigSource).toContain("instructions");
    expect(openCodeConfigSource).toContain("https://clankeroverflow.com/opencode/clankeroverflow.md");
    expect(dashboardSource.indexOf("MCP Usage")).toBeLessThan(dashboardSource.indexOf("CLI Usage"));
  });
});
