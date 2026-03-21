import { describe, expect, it } from "bun:test";
import { parse } from "dotenv";

import {
  getDatabaseUrlErrorMessage,
  getInfraEnvFiles,
  loadInfraEnv,
} from "./env";

function createEnv(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...overrides,
  };
}

function loadTestEnvFile(
  env: NodeJS.ProcessEnv,
  files: Record<string, string>,
  path: string | string[] | URL | undefined,
): void {
  if (typeof path !== "string") {
    return;
  }

  for (const [key, value] of Object.entries(parse(files[path] ?? ""))) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

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
      loadedPaths.push(typeof path === "string" ? path : "");
      return {};
    });

    expect(loadedPaths).toEqual([
      "./.env.production",
      "../../apps/web/.env",
      "../../apps/server/.env",
    ]);
  });

  it("replaces a preloaded local database url during deploys", () => {
    const files: Record<string, string> = {
      "./.env": "DATABASE_URL=postgresql://localhost:5432/localdb\nALCHEMY_PASSWORD=local",
      "./.env.production": "DATABASE_URL=postgresql://public.example.com:5432/proddb\nNEXT_PUBLIC_SERVER_URL=https://api.clankeroverflow.com",
      "../../apps/web/.env": "NEXT_PUBLIC_SERVER_URL=http://localhost:3000",
      "../../apps/server/.env": "DATABASE_URL=postgresql://localhost:5432/localdb\nBETTER_AUTH_SECRET=dev-secret",
    };

    const env = createEnv({
      DATABASE_URL: "postgresql://localhost:5432/localdb",
    });

    loadInfraEnv(
      false,
      ({ path }) => {
        loadTestEnvFile(env, files, path);

        return {};
      },
      env,
      (path) => files[path] ?? null,
    );

    expect(env.DATABASE_URL).toBe("postgresql://public.example.com:5432/proddb");
  });

  it("keeps an explicit deploy database url override", () => {
    const files: Record<string, string> = {
      "./.env": "DATABASE_URL=postgresql://localhost:5432/localdb\nALCHEMY_PASSWORD=local",
      "./.env.production": "DATABASE_URL=postgresql://public.example.com:5432/proddb",
      "../../apps/web/.env": "NEXT_PUBLIC_SERVER_URL=http://localhost:3000",
      "../../apps/server/.env": "DATABASE_URL=postgresql://localhost:5432/localdb",
    };

    const env = createEnv({
      DATABASE_URL: "postgresql://override.example.com:5432/customdb",
    });

    loadInfraEnv(
      false,
      ({ path }) => {
        loadTestEnvFile(env, files, path);

        return {};
      },
      env,
      (path) => files[path] ?? null,
    );

    expect(env.DATABASE_URL).toBe("postgresql://override.example.com:5432/customdb");
  });
});

describe("getDatabaseUrlErrorMessage", () => {
  it("explains shell quoting for deploys", () => {
    expect(getDatabaseUrlErrorMessage(false)).toContain(
      "DATABASE_URL='postgresql://...&channel_binding=require' bun run deploy",
    );
  });
});
