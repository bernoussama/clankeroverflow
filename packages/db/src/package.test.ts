import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageJson;

describe("packages/db package metadata", () => {
  it("ships pg runtime and types as dependencies for source consumers", () => {
    expect(packageJson.dependencies?.pg).toBe("catalog:");
    expect(packageJson.dependencies?.["@types/pg"]).toBe("^8.18.0");
    expect(packageJson.devDependencies?.["@types/pg"]).toBeUndefined();
  });
});
