import { describe, expect, it } from "bun:test";

import { getDatabaseUrlErrorMessage, getInfraEnvFiles, loadInfraEnv } from "./env";

describe("getInfraEnvFiles", () => {
  it("uses the local infra env file for local runs", () => {
    expect(getInfraEnvFiles(true)).toEqual([
      "../../apps/web/.env",
      "../../apps/server/.env",
      "./.env",
    ]);
  });

  it("uses the production infra env file for deploys", () => {
    expect(getInfraEnvFiles(false)).toEqual([
      "../../apps/web/.env",
      "../../apps/server/.env",
      "./.env.production",
    ]);
  });
});

describe("loadInfraEnv", () => {
  it("loads the expected env files in order", () => {
    const loadedPaths: string[] = [];

    loadInfraEnv(false, ({ path }) => {
      loadedPaths.push(path ?? "");
      return {};
    });

    expect(loadedPaths).toEqual([
      "../../apps/web/.env",
      "../../apps/server/.env",
      "./.env.production",
    ]);
  });
});

describe("getDatabaseUrlErrorMessage", () => {
  it("explains shell quoting for deploys", () => {
    expect(getDatabaseUrlErrorMessage(false)).toContain(
      "DATABASE_URL='postgresql://...&channel_binding=require' bun run deploy",
    );
  });
});
