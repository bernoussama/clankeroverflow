import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runDevWithPostgres } from "./dev-with-postgres";

type PackageJson = {
  scripts?: Record<string, string>;
};

type TurboConfig = {
  tasks?: Record<string, unknown>;
};

function createDeferred() {
  let resolve!: (value: number) => void;

  const promise = new Promise<number>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return {
    promise,
    resolve,
  };
}

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageJson;

const turboConfig = JSON.parse(
  readFileSync(new URL("../turbo.json", import.meta.url), "utf8"),
) as TurboConfig;

describe("root dev workflow", () => {
  it("routes pnpm dev through the postgres wrapper and keeps the schema sync and migrate tasks available", () => {
    expect(packageJson.scripts?.dev).toBe("tsx scripts/dev-with-postgres.ts");
    expect(packageJson.scripts?.["db:migrate"]).toBe("turbo run db:migrate --filter=@clankeroverflow/db");
    expect(packageJson.scripts?.["db:push"]).toBe("turbo run db:push --filter=@clankeroverflow/db");
    expect(packageJson.scripts?.["dev:bare"]).toBe("turbo run dev --filter=web --filter=server");
    expect(turboConfig.tasks?.["db:migrate"]).toBeDefined();
  });
});

describe("dev-with-postgres", () => {
  it("starts docker compose before the dev process and tears it down after exit", async () => {
    const calls: string[][] = [];

    await runDevWithPostgres({
      registerSignalHandler: () => {
        return () => {};
      },
      runCommand: async (cmd) => {
        calls.push(cmd);
      },
      spawnCommand: (cmd) => {
        calls.push(cmd);

        return {
          exited: Promise.resolve(0),
          kill: () => {},
        };
      },
    });

    expect(calls).toEqual([
      ["docker", "compose", "up", "-d", "--wait"],
      ["pnpm", "run", "db:push"],
      ["pnpm", "run", "dev:bare"],
      ["docker", "compose", "down"],
    ]);
  });

  it("forwards shutdown signals to the dev process and still runs docker compose down once", async () => {
    const deferred = createDeferred();
    const calls: string[][] = [];
    const kills: string[] = [];
    const signalHandlers = new Map<string, () => void>();

    const lifecycle = runDevWithPostgres({
      registerSignalHandler: (signal, handler) => {
        signalHandlers.set(signal, handler);
        return () => {
          signalHandlers.delete(signal);
        };
      },
      runCommand: async (cmd) => {
        calls.push(cmd);
      },
      spawnCommand: (cmd) => {
        calls.push(cmd);

        return {
          exited: deferred.promise,
          kill: (signal) => {
            kills.push(signal);
          },
        };
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    signalHandlers.get("SIGINT")?.();
    deferred.resolve(0);

    await lifecycle;

    expect(kills).toEqual(["SIGINT"]);
    expect(calls).toEqual([
      ["docker", "compose", "up", "-d", "--wait"],
      ["pnpm", "run", "db:push"],
      ["pnpm", "run", "dev:bare"],
      ["docker", "compose", "down"],
    ]);
  });
});
