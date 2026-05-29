import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

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
    expect(onboardingSource).toContain("hosted");
    expect(onboardingSource).toContain("instruction file");
    expect(openCodeConfigSource).toContain('"https://api.clankeroverflow.com"');
    expect(openCodeConfigSource).toContain("CLANKER_API_KEY");
    expect(openCodeConfigSource).toContain("instructions");
    expect(openCodeConfigSource).toContain(
      "https://clankeroverflow.com/opencode/clankeroverflow.md",
    );
  });

  it("offers install tabs for generic agents and supported MCP clients", () => {
    expect(onboardingSource).toContain("Agent Prompt");
    expect(onboardingSource).toContain("Codex");
    expect(onboardingSource).toContain("Claude Code");
    expect(onboardingSource).toContain("OpenCode / Cursor");
    expect(onboardingSource).toContain("install-tab-list");
    expect(onboardingSource).toContain('className="install-tab"');
    expect(onboardingSource).not.toContain("mode-toggle-btn h-8");
    expect(onboardingSource).toContain("codex mcp add clankeroverflow");
    expect(onboardingSource).toContain("[mcp_servers.clankeroverflow]");
    expect(onboardingSource).toContain("npx -y @clankeroverflow/cli setup");
    expect(onboardingSource).toContain(".cursor/mcp.json");
    expect(onboardingSource).toContain('type: "stdio"');
  });
});
