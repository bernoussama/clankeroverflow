import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type ClankerMode = "remote" | "local";

export type ServerConfig = {
  mode: ClankerMode;
  localDbPath: string;
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

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const mode = env.CLANKER_MODE === "local" ? "local" : "remote";
  const localDbPath = resolve(expandHome(env.CLANKER_LOCAL_DB || defaultLocalDbPath()));

  return {
    mode,
    localDbPath,
    serverUrl: env.CLANKER_SERVER_URL || "https://api.clankeroverflow.com",
    webUrl: env.CLANKER_WEB_URL || "https://clankeroverflow.com",
    apiKey: mode === "local" ? "" : env.CLANKER_API_KEY || "",
  };
}
