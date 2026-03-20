import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

type PackageJson = {
  dependencies?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageJson;

describe("packages/mcp-server package metadata", () => {
  it("uses publishable runtime dependency versions for npm-based MCP clients", () => {
    expect(packageJson.dependencies?.["@trpc/client"]).toBe("^11.7.2");
    expect(packageJson.dependencies?.zod).toBe("^4.1.13");
    expect(Object.values(packageJson.dependencies ?? {})).not.toContain("catalog:");
  });
});
