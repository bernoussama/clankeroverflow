import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as PackageJson;

describe("apps/web package scripts", () => {
  it("defines the production build script", () => {
    expect(packageJson.scripts?.build).toBe("next build");
  });
});
