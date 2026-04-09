import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const onboardingSource = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
const openCodeConfigSource = readFileSync(
  new URL("../../lib/opencode-config.ts", import.meta.url),
  "utf8",
);

describe("onboarding API key setup", () => {
  it("creates keys through the Better Auth client plugin", () => {
    expect(onboardingSource).toContain("authClient.apiKey.create");
    expect(onboardingSource).not.toContain("trpc.apiKeys.create");
  });

  it("uses the shared OpenCode config with hosted workflow instructions", () => {
    expect(onboardingSource).toContain("buildOpenCodeConfig");
    expect(onboardingSource).toContain("hosted instruction file");
    expect(openCodeConfigSource).toContain('"https://api.clankeroverflow.com"');
    expect(openCodeConfigSource).toContain("CLANKER_API_KEY");
    expect(openCodeConfigSource).toContain("instructions");
    expect(openCodeConfigSource).toContain("https://clankeroverflow.com/opencode/clankeroverflow.md");
  });
});
