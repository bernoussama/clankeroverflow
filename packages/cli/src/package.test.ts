import { describe, expect, test } from "vitest";
import packageJson from "../package.json";

describe("packages/cli package metadata", () => {
  test("publishes bundled skills without a package install hook", () => {
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("skills");
    expect(packageJson.files).not.toContain("postinstall.mjs");
    expect(
      (packageJson.scripts as Record<string, string> | undefined)?.postinstall,
    ).toBeUndefined();
  });

  test("publishes the CLI as the MCP runtime", () => {
    expect(packageJson.bin).toEqual({ clanker: "dist/index.mjs" });
    expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"]).toBe("^1.27.1");
    expect(packageJson.dependencies?.["better-sqlite3"]).toBe("12.10.0");
    expect(packageJson.dependencies?.mcplog).toBe("^0.0.5");
    expect(packageJson.dependencies?.zod).toBe("^4.1.13");
    expect(packageJson.dependencies?.["@clankeroverflow/mcp-logger"]).toBeUndefined();
    expect(packageJson.devDependencies?.["@clankeroverflow/mcp-logger"]).toBeUndefined();
    expect(Object.values(packageJson.dependencies ?? {})).not.toContain("catalog:");
  });
});
