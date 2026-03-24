import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const onboardingSource = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");

describe("onboarding API key setup", () => {
  it("creates keys through the Better Auth client plugin", () => {
    expect(onboardingSource).toContain("authClient.apiKey.create");
    expect(onboardingSource).not.toContain("trpc.apiKeys.create");
  });

  it("keeps the MCP config pointed at the production API domain", () => {
    expect(onboardingSource).toContain('"https://api.clankeroverflow.com"');
    expect(onboardingSource).toContain("CLANKER_API_KEY");
  });
});
