import { describe, expect, it } from "bun:test";

import {
  getDatabaseUrlErrorMessage,
  getInfraEnvFiles,
  loadInfraEnv,
} from "./env";

describe("getInfraEnvFiles", () => {
  it("uses the local infra env file for local runs", () => {
    expect(getInfraEnvFiles(true)).toEqual([
      "./.env",
      "../../apps/web/.env",
      "../../apps/server/.env",
    ]);
  });

  it("uses the production infra env file for deploys", () => {
    expect(getInfraEnvFiles(false)).toEqual([
      "./.env.production",
      "../../apps/web/.env",
      "../../apps/server/.env",
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
      "./.env.production",
      "../../apps/web/.env",
      "../../apps/server/.env",
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
