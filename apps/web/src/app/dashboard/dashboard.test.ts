import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");

describe("dashboard API key UX", () => {
  it("reuses one query key for loading and invalidation", () => {
    expect(dashboardSource).toContain('const apiKeysQueryKey = ["apiKeys", "list"] as const;');
    expect(dashboardSource).toContain("queryKey: apiKeysQueryKey");
    expect(dashboardSource).toContain("invalidateQueries({ queryKey: apiKeysQueryKey })");
  });

  it("keeps the freshly created API key visible when clipboard access fails", () => {
    expect(dashboardSource).toContain("const [createdKey, setCreatedKey]");
    expect(dashboardSource).toContain("setCreatedKey(data);");
    expect(dashboardSource).toContain("Clipboard access was blocked");
  });

  it("keeps persisted API keys masked while still hydrating the list cache immediately", () => {
    expect(dashboardSource).toContain("setQueryData<ApiKeys>");
    expect(dashboardSource).toContain("keyPreview: data.keyPreview");
    expect(dashboardSource).toContain("{apiKey.keyPreview}");
    expect(dashboardSource).toContain("You will only be able to copy it again from this panel until you dismiss it.");
  });

  it("documents MCP usage before CLI usage", () => {
    expect(dashboardSource).toContain("MCP Usage");
    expect(dashboardSource).toContain("OpenCode");
    expect(dashboardSource).toContain("opencode.json");
    expect(dashboardSource).toContain("&quot;mcp&quot;");
    expect(dashboardSource).toContain("&quot;type&quot;");
    expect(dashboardSource).toContain("&quot;local&quot;");
    expect(dashboardSource).toContain("&quot;environment&quot;");
    expect(dashboardSource).toContain("clanker-mcp");
    expect(dashboardSource).toContain("https://api.clankeroverflow.com");
    expect(dashboardSource.indexOf("MCP Usage")).toBeLessThan(dashboardSource.indexOf("CLI Usage"));
  });
});
