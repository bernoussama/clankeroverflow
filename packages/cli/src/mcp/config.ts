import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEFAULT_LOCAL_MODEL_DIMENSIONS,
  DEFAULT_LOCAL_MODEL_ID,
  defaultLocalModelPath,
} from "./local-semantic";

export type ClankerMode = "remote" | "local";

export type ServerConfig = {
  mode: ClankerMode;
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

function defaultLocalDbPath() {
  return join(homedir(), ".local", "share", "clankeroverflow", "solutions.sqlite");
}

function expandHome(path: string) {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function localSemanticEnabled(env: NodeJS.ProcessEnv, mode: ClankerMode) {
  if (mode !== "local") return false;
  const value = env.CLANKER_LOCAL_SEMANTIC?.toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const mode = env.CLANKER_MODE === "local" ? "local" : "remote";
  const localDbPath = resolve(expandHome(env.CLANKER_LOCAL_DB || defaultLocalDbPath()));
  const modelPath = resolve(expandHome(env.CLANKER_LOCAL_MODEL_PATH || defaultLocalModelPath(env)));

  return {
    mode,
    localDbPath,
    localSemantic: {
      enabled: localSemanticEnabled(env, mode),
      modelId: env.CLANKER_LOCAL_MODEL_ID || DEFAULT_LOCAL_MODEL_ID,
      modelPath,
      dimensions: Number(env.CLANKER_LOCAL_MODEL_DIMENSIONS || DEFAULT_LOCAL_MODEL_DIMENSIONS),
    },
    serverUrl: env.CLANKER_SERVER_URL || "https://api.clankeroverflow.com",
    webUrl: env.CLANKER_WEB_URL || "https://clankeroverflow.com",
    apiKey: mode === "local" ? "" : env.CLANKER_API_KEY || "",
  };
}
