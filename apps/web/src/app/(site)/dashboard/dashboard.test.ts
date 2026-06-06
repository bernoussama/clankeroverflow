import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
describe("dashboard API key UX", () => {
  it("reuses one user-scoped query key for loading and invalidation", () => {
    expect(dashboardSource).toContain(
      'const apiKeysQueryKey = ["apiKeys", "list", sessionUserId] as const;',
    );
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

  it("lists logged solutions under API key management with owner pagination", () => {
    expect(dashboardSource).toContain(
      'const mySolutionsQueryKey = ["solutions", "mine", sessionUserId] as const;',
    );
    expect(dashboardSource).toContain("trpcClient.solutions.mine.query");
    expect(dashboardSource).toContain("solutionListSchema.parse");
    expect(dashboardSource).toContain("getNextPageParam: (lastPage) => lastPage.nextCursor");
    expect(dashboardSource).toContain("Logged Solutions");
    expect(dashboardSource).toContain("Solutions logged by API keys owned by this account.");
    expect(dashboardSource).toContain("Load More");
  });

  it("makes logged solution rows clickable and user-deletable", () => {
    expect(dashboardSource).toContain("href={`/solution/${solution.id}`}");
    expect(dashboardSource).toContain("trpcClient.solutions.delete.mutate");
    expect(dashboardSource).toContain(
      "Are you sure you want to delete this solution? This cannot be undone.",
    );
    expect(dashboardSource).toContain("Failed to delete solution");
    expect(dashboardSource).toContain("Solution deleted successfully");
    expect(dashboardSource).toContain("Delete Solution");
  });

  it("uses the centralized dashboard/design-system classes for logged solutions", () => {
    expect(dashboardSource).toContain("border-landing");
    expect(dashboardSource).toContain("bg-surface-landing/10");
    expect(dashboardSource).toContain("mode-toggle-btn");
    expect(dashboardSource).toContain("btn-secondary");
    expect(dashboardSource).not.toContain("styled.");
  });

  it("documents MCP usage before CLI usage", () => {
    expect(dashboardSource).toContain("MCP Usage");
    expect(dashboardSource).toContain("npm install -g @clankeroverflow/cli && clanker setup");
    expect(dashboardSource).not.toContain("opencode.json");
    expect(dashboardSource).not.toContain("buildOpenCodeConfig");
    expect(dashboardSource).toContain("clanker mcp");
    expect(dashboardSource).toMatch(/loads ClankerOverflow\s+workflow instructions/);
    expect(dashboardSource.indexOf("MCP Usage")).toBeLessThan(dashboardSource.indexOf("CLI Usage"));
  });
});
