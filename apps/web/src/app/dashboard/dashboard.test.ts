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
});
