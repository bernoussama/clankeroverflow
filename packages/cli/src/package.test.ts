import { describe, expect, test } from "vitest";
import packageJson from "../package.json";
import claudePluginJson from "../.claude-plugin/plugin.json";
import codexPluginJson from "../.codex-plugin/plugin.json";
import openClawPluginJson from "../openclaw.plugin.json";

describe("packages/cli package metadata", () => {
  test("publishes bundled skills without a package install hook", () => {
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("skills");
    expect(packageJson.files).toContain(".codex-plugin");
    expect(packageJson.files).toContain("openclaw.plugin.json");
    expect(packageJson.files).not.toContain("postinstall.mjs");
    expect(
      (packageJson.scripts as Record<string, string> | undefined)?.postinstall,
    ).toBeUndefined();
  });

  test("publishes the CLI as the MCP runtime", () => {
    expect(packageJson.bin).toEqual({ clanker: "dist/index.mjs" });
    expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"]).toBe("^1.27.1");
    expect(packageJson.dependencies?.["@clankeroverflow/api"]).toBeUndefined();
    expect(packageJson.devDependencies?.["@clankeroverflow/api"]).toBe("workspace:*");
    expect(packageJson.dependencies?.["better-sqlite3"]).toBe("12.10.0");
    expect(packageJson.dependencies?.mcplog).toBe("^0.0.5");
    expect(packageJson.dependencies?.zod).toBe("^4.1.13");
    expect(packageJson.dependencies?.["@clankeroverflow/mcp-logger"]).toBeUndefined();
    expect(packageJson.devDependencies?.["@clankeroverflow/mcp-logger"]).toBeUndefined();
    expect(Object.values(packageJson.dependencies ?? {})).not.toContain("catalog:");
  });

  test("publishes an OpenClaw-compatible ClawHub bundle", () => {
    expect(codexPluginJson.name).toBe("clankeroverflow");
    expect(codexPluginJson.version).toBe(packageJson.version);
    expect(codexPluginJson.description).toContain("Search-first debugging memory");
    expect(codexPluginJson.description).toContain("vote on tried solutions");
    expect(codexPluginJson.keywords).toContain("ci-failures");
    expect(codexPluginJson.keywords).toContain("build-failures");
    expect(codexPluginJson.skills).toBe("./skills/");
    expect(codexPluginJson.mcpServers).toBe("./.mcp.json");
    expect(claudePluginJson.description).toBe(codexPluginJson.description);
    expect(claudePluginJson.keywords).toEqual(codexPluginJson.keywords);
    expect(openClawPluginJson.id).toBe("@bernoussama/clankeroverflow");
    expect(openClawPluginJson.version).toBe(packageJson.version);
    expect(openClawPluginJson.description).toBe(codexPluginJson.description);
    expect(openClawPluginJson.skills).toEqual(["./skills"]);
    expect(openClawPluginJson.configSchema).toEqual({
      type: "object",
      additionalProperties: false,
    });
  });
});
