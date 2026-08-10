import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

export type ClankerMode = "remote" | "local";
export type BackendSource = "configured" | ClankerMode;

const httpUrl = z
  .string()
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "must use http or https",
  });

export const persistedConfigSchema = z
  .object({
    version: z.literal(2),
    mode: z.enum(["local", "remote"]),
    local: z
      .object({
        databasePath: z.string().min(1),
      })
      .strict(),
    remote: z
      .object({
        serverUrl: httpUrl,
        webUrl: httpUrl,
      })
      .strict(),
  })
  .strict();

export type PersistedConfig = z.infer<typeof persistedConfigSchema>;

const legacyPersistedConfigSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["local", "remote"]),
    local: z
      .object({
        databasePath: z.string().min(1),
        semantic: z.boolean(),
        modelId: z.string().min(1),
        modelPath: z.string().min(1),
        dimensions: z.number().int().positive(),
      })
      .strict(),
    remote: z
      .object({
        serverUrl: httpUrl,
        webUrl: httpUrl,
      })
      .strict(),
  })
  .strict();

export type ConfigPathOptions = {
  configPath?: string;
  home?: string;
  platform?: NodeJS.Platform;
};

export type ServerConfig = {
  mode: ClankerMode;
  configPath: string;
  hasPersistedConfig: boolean;
  localDbPath: string;
  migrationWarnings: string[];
  serverUrl: string;
  webUrl: string;
  apiKey: string;
};

function defaultLocalDbPath(home: string) {
  return join(home, ".local", "share", "clankeroverflow", "solutions.sqlite");
}

function defaultLegacyModelPath(env: NodeJS.ProcessEnv, home: string) {
  const cacheRoot = env.XDG_CACHE_HOME || join(home, ".cache");
  return join(cacheRoot, "clankeroverflow", "models", "bge-small-en-v1.5-q8_0.gguf");
}

function expandHome(value: string, home: string) {
  if (value === "~") return home;
  if (value.startsWith("~/")) return join(home, value.slice(2));
  return value;
}

function normalizePath(value: string, home: string) {
  return resolve(expandHome(value, home));
}

export function getConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  options: ConfigPathOptions = {},
) {
  if (options.configPath) return resolve(options.configPath);
  const home = options.home ?? env.HOME ?? homedir();
  if (env.XDG_CONFIG_HOME) {
    return join(env.XDG_CONFIG_HOME, "clankeroverflow", "config.json");
  }

  const platform = options.platform ?? process.platform;
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "clankeroverflow", "config.json");
  }
  if (platform === "win32") {
    return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "clankeroverflow", "config.json");
  }
  return join(home, ".config", "clankeroverflow", "config.json");
}

function formatConfigError(configPath: string, error: unknown) {
  if (error instanceof z.ZodError) {
    const detail = error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");
    return new Error(`Invalid ClankerOverflow config at ${configPath}: ${detail}`);
  }
  return new Error(
    `Invalid ClankerOverflow config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

export function readPersistedConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: ConfigPathOptions = {},
): PersistedConfig | undefined {
  return readPersistedConfigDetailed(env, options).config;
}

function writeConfigSync(configPath: string, config: PersistedConfig) {
  const directory = dirname(configPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(directory, `.config.json.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporaryPath, configPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function removeManagedLegacyModel(env: NodeJS.ProcessEnv, home: string) {
  const managedPath = resolve(defaultLegacyModelPath(env, home));
  const existed = existsSync(managedPath);
  rmSync(managedPath, { force: true });
  for (const directory of [dirname(managedPath), dirname(dirname(managedPath))]) {
    try {
      rmdirSync(directory);
    } catch {
      break;
    }
  }
  return existed;
}

function readPersistedConfigDetailed(
  env: NodeJS.ProcessEnv = process.env,
  options: ConfigPathOptions = {},
): { config?: PersistedConfig; warnings: string[] } {
  const configPath = getConfigPath(env, options);
  if (!existsSync(configPath)) return { warnings: [] };

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    const current = persistedConfigSchema.safeParse(raw);
    if (current.success) return { config: current.data, warnings: [] };

    const legacy = legacyPersistedConfigSchema.parse(raw);
    const home = options.home ?? env.HOME ?? homedir();
    const config: PersistedConfig = {
      version: 2,
      mode: legacy.mode,
      local: { databasePath: legacy.local.databasePath },
      remote: legacy.remote,
    };
    const legacyModelPath = normalizePath(legacy.local.modelPath, home);
    const managedModelPath = resolve(defaultLegacyModelPath(env, home));
    const removedManagedModel = removeManagedLegacyModel(env, home);
    writeConfigSync(configPath, config);
    const warnings = ["Migrated ClankerOverflow configuration from v1 to keyword-only v2."];
    if (removedManagedModel) {
      warnings.push(`Deleted the managed v1 embedding model at ${managedModelPath}.`);
    }
    if (legacyModelPath !== managedModelPath && existsSync(legacyModelPath)) {
      warnings.push(`Preserved custom legacy embedding model at ${legacyModelPath}.`);
    }
    return { config, warnings };
  } catch (error) {
    throw formatConfigError(configPath, error);
  }
}

export function resolveConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: ConfigPathOptions = {},
): ServerConfig {
  const home = options.home ?? env.HOME ?? homedir();
  const configPath = getConfigPath(env, options);
  const persistedResult = readPersistedConfigDetailed(env, options);
  const persisted = persistedResult.config;
  const mode = persisted?.mode ?? (env.CLANKER_MODE === "local" ? "local" : "remote");

  const persistedLocal = persisted?.local;
  const persistedRemote = persisted?.remote;
  const localDbPath = normalizePath(
    env.CLANKER_LOCAL_DB || persistedLocal?.databasePath || defaultLocalDbPath(home),
    home,
  );
  const legacyEnvNames = [
    "CLANKER_LOCAL_SEMANTIC",
    "CLANKER_LOCAL_MODEL_ID",
    "CLANKER_LOCAL_MODEL_PATH",
    "CLANKER_LOCAL_MODEL_DIMENSIONS",
  ].filter((name) => env[name] !== undefined);

  return {
    mode,
    configPath,
    hasPersistedConfig: Boolean(persisted),
    localDbPath,
    migrationWarnings: [
      ...persistedResult.warnings,
      ...(legacyEnvNames.length
        ? [`Ignored removed v1 environment settings: ${legacyEnvNames.join(", ")}.`]
        : []),
    ],
    serverUrl:
      env.CLANKER_SERVER_URL || persistedRemote?.serverUrl || "https://api.clankeroverflow.com",
    webUrl: env.CLANKER_WEB_URL || persistedRemote?.webUrl || "https://clankeroverflow.com",
    apiKey: env.CLANKER_API_KEY || "",
  };
}

export function toPersistedConfig(
  config: ServerConfig,
  mode: ClankerMode = config.mode,
): PersistedConfig {
  return {
    version: 2,
    mode,
    local: {
      databasePath: config.localDbPath,
    },
    remote: {
      serverUrl: config.serverUrl,
      webUrl: config.webUrl,
    },
  };
}

export async function writePersistedConfig(
  value: PersistedConfig,
  env: NodeJS.ProcessEnv = process.env,
  options: ConfigPathOptions = {},
) {
  const configPath = getConfigPath(env, options);
  let config: PersistedConfig;
  try {
    config = persistedConfigSchema.parse(value);
  } catch (error) {
    throw formatConfigError(configPath, error);
  }

  const directory = dirname(configPath);
  const temporaryPath = join(directory, `.config.json.${process.pid}.${Date.now()}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, configPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
  return configPath;
}

export function modeForSource(config: ServerConfig, source: BackendSource): ClankerMode {
  return source === "configured" ? config.mode : source;
}
