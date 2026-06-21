import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  getConfigPath,
  readPersistedConfig,
  resolveConfig,
  toPersistedConfig,
  writePersistedConfig,
} from "./config";

describe("MCP config", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clanker-config-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  test("uses platform-appropriate config paths", () => {
    expect(getConfigPath({}, { home, platform: "linux" })).toBe(
      join(home, ".config", "clankeroverflow", "config.json"),
    );
    expect(getConfigPath({}, { home, platform: "darwin" })).toBe(
      join(home, "Library", "Application Support", "clankeroverflow", "config.json"),
    );
    expect(
      getConfigPath({ APPDATA: "C:\\Users\\test\\AppData\\Roaming" }, { home, platform: "win32" }),
    ).toBe(join("C:\\Users\\test\\AppData\\Roaming", "clankeroverflow", "config.json"));
    expect(getConfigPath({ XDG_CONFIG_HOME: "/tmp/xdg" }, { home })).toBe(
      "/tmp/xdg/clankeroverflow/config.json",
    );
  });

  test("writes and reads a versioned config atomically", async () => {
    const env = { HOME: home };
    const initial = toPersistedConfig(resolveConfig(env, { home }), "local");
    initial.local.databasePath = "~/private/solutions.sqlite";

    const configPath = await writePersistedConfig(initial, env, { home });

    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual(initial);
    expect(readPersistedConfig(env, { home })).toEqual(initial);
    expect(resolveConfig(env, { home }).localDbPath).toBe(
      join(home, "private", "solutions.sqlite"),
    );
  });

  test("persisted mode beats CLANKER_MODE while non-mode environment settings override", async () => {
    const baseEnv = { HOME: home };
    const persisted = toPersistedConfig(resolveConfig(baseEnv, { home }), "local");
    await writePersistedConfig(persisted, baseEnv, { home });

    const config = resolveConfig(
      {
        HOME: home,
        CLANKER_MODE: "remote",
        CLANKER_API_KEY: "clk_test",
        CLANKER_LOCAL_DB: "~/override.sqlite",
      },
      { home },
    );

    expect(config.mode).toBe("local");
    expect(config.apiKey).toBe("clk_test");
    expect(config.localDbPath).toBe(join(home, "override.sqlite"));
  });

  test("uses legacy mode and remote fallback only when config is absent", () => {
    expect(resolveConfig({ HOME: home, CLANKER_MODE: "local" }, { home }).mode).toBe("local");
    expect(resolveConfig({ HOME: home }, { home }).mode).toBe("remote");
  });

  test("keeps local semantic settings available for explicit local-source searches", () => {
    expect(resolveConfig({ HOME: home }, { home }).localSemantic.enabled).toBe(true);
    for (const value of ["0", "false", "off"]) {
      expect(
        resolveConfig({ HOME: home, CLANKER_LOCAL_SEMANTIC: value }, { home }).localSemantic
          .enabled,
      ).toBe(false);
    }
  });

  test("fails closed on malformed or unsupported config", async () => {
    const configPath = getConfigPath({ HOME: home }, { home });
    await mkdir(join(home, ".config", "clankeroverflow"), { recursive: true });
    await writeFile(configPath, "{ broken", "utf8");
    expect(() => resolveConfig({ HOME: home }, { home })).toThrow(
      `Invalid ClankerOverflow config at ${configPath}`,
    );

    await writeFile(configPath, JSON.stringify({ version: 2, mode: "local" }), "utf8");
    expect(() => resolveConfig({ HOME: home }, { home })).toThrow("version");
  });
});
