import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

import {
  DEFAULT_LOCAL_MODEL_DIMENSIONS,
  DEFAULT_LOCAL_MODEL_ID,
  defaultLocalModelPath,
} from "./local-semantic";

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

export type PersistedConfig = z.infer<typeof persistedConfigSchema>;

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
  localSemantic: {
    enabled: boolean;
    modelId: string;
    modelPath: string;
    dimensions: number;
  };
  serverUrl: string;
  webUrl: string;
  apiKey: string;
};

function defaultLocalDbPath(home: string) {
  return join(home, ".local", "share", "clankeroverflow", "solutions.sqlite");
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
  const configPath = getConfigPath(env, options);
  if (!existsSync(configPath)) return undefined;

  try {
    return persistedConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
  } catch (error) {
    throw formatConfigError(configPath, error);
  }
}

function envSemanticEnabled(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "off";
}

function parseDimensions(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const dimensions = Number(value);
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("CLANKER_LOCAL_MODEL_DIMENSIONS must be a positive integer");
  }
  return dimensions;
}

export function resolveConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: ConfigPathOptions = {},
): ServerConfig {
  const home = options.home ?? env.HOME ?? homedir();
  const configPath = getConfigPath(env, options);
  const persisted = readPersistedConfig(env, options);
  const mode = persisted?.mode ?? (env.CLANKER_MODE === "local" ? "local" : "remote");

  const persistedLocal = persisted?.local;
  const persistedRemote = persisted?.remote;
  const localDbPath = normalizePath(
    env.CLANKER_LOCAL_DB || persistedLocal?.databasePath || defaultLocalDbPath(home),
    home,
  );
  const modelPath = normalizePath(
    env.CLANKER_LOCAL_MODEL_PATH ||
      persistedLocal?.modelPath ||
      defaultLocalModelPath({ ...env, HOME: home }),
    home,
  );
  const semanticEnabled = envSemanticEnabled(
    env.CLANKER_LOCAL_SEMANTIC,
    persistedLocal?.semantic ?? true,
  );

  return {
    mode,
    configPath,
    hasPersistedConfig: Boolean(persisted),
    localDbPath,
    localSemantic: {
      enabled: semanticEnabled,
      modelId: env.CLANKER_LOCAL_MODEL_ID || persistedLocal?.modelId || DEFAULT_LOCAL_MODEL_ID,
      modelPath,
      dimensions: parseDimensions(
        env.CLANKER_LOCAL_MODEL_DIMENSIONS,
        persistedLocal?.dimensions ?? DEFAULT_LOCAL_MODEL_DIMENSIONS,
      ),
    },
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
    version: 1,
    mode,
    local: {
      databasePath: config.localDbPath,
      semantic: config.localSemantic.enabled,
      modelId: config.localSemantic.modelId,
      modelPath: config.localSemantic.modelPath,
      dimensions: config.localSemantic.dimensions,
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
