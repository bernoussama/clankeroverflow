import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

type PackageJson = {
  scripts?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as PackageJson;

describe("apps/web package scripts", () => {
  it("forces webpack for production builds consumed by OpenNext", () => {
    expect(packageJson.scripts?.build).toBe("next build --webpack");
  });
});
