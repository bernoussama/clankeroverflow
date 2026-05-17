import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("packages/mcp-server package metadata", () => {
  it("uses package.json as the MCP metadata source of truth", async () => {
    const { createServer } = await import("./index");

    expect(packageJson.name).toBe("@clankeroverflow/mcp-server");
    expect(packageJson.version).toBe("1.0.2");
    expect(createServer).toBeDefined();
  });

  it("uses publishable runtime dependency versions for npm-based MCP clients", () => {
    expect(packageJson.dependencies?.["@trpc/client"]).toBe("^11.7.2");
    expect(packageJson.dependencies?.zod).toBe("^4.1.13");
    expect(Object.values(packageJson.dependencies ?? {})).not.toContain("catalog:");
  });

  it("publishes the bundled MCP usage skill for installed users", () => {
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("skills");
  });
});
