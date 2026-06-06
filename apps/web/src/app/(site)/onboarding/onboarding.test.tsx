import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const onboardingSource = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
describe("onboarding API key setup", () => {
  it("creates keys through the Better Auth client plugin", () => {
    expect(onboardingSource).toContain("authClient.apiKey.create");
    expect(onboardingSource).not.toContain("trpc.apiKeys.create");
  });

  it("uses the same streamlined MCP setup content as the dashboard", () => {
    expect(onboardingSource).toContain("npm install -g @clankeroverflow/cli && clanker setup");
    expect(onboardingSource).toContain("search_solutions");
    expect(onboardingSource).toContain("CLANKER_API_KEY");
    expect(onboardingSource).toContain("clanker mcp");
    expect(onboardingSource).toMatch(/loads ClankerOverflow workflow\s+instructions/);
    expect(onboardingSource).not.toContain("install-tab-list");
    expect(onboardingSource).not.toContain("buildOpenCodeConfig");
  });
});
