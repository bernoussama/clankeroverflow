import { describe, expect, test } from "bun:test";
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
});
