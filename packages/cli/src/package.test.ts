import { describe, expect, test } from "vitest";
import packageJson from "../package.json";

describe("packages/cli package metadata", () => {
  test("publishes the bundled OpenCode skill and install hook", () => {
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("skills");
    expect(packageJson.files).toContain("postinstall.mjs");
    expect((packageJson.scripts as Record<string, string> | undefined)?.postinstall).toBe(
      "node postinstall.mjs",
    );
  });

  test("publishes the CLI as the MCP runtime", () => {
    expect(packageJson.bin).toEqual({ clanker: "dist/index.mjs" });
    expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"]).toBe("^1.27.1");
    expect(packageJson.dependencies?.["better-sqlite3"]).toBe("12.10.0");
    expect(packageJson.dependencies?.zod).toBe("^4.1.13");
    expect(Object.values(packageJson.dependencies ?? {})).not.toContain("catalog:");
  });
});
