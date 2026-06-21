import type { SolutionBackend } from "./backend";
import { resolveConfig, type ClankerMode, type ServerConfig } from "./config";
import { LocalBackend } from "./local-backend";
import { RemoteBackend } from "./remote-backend";

export function createSolutionBackend(
  config: ServerConfig = resolveConfig(),
  mode: ClankerMode = config.mode,
): SolutionBackend {
  if (mode === "local") {
    return new LocalBackend(config.localDbPath, { semantic: config.localSemantic });
  }

  return new RemoteBackend({
    serverUrl: config.serverUrl,
    apiKey: config.apiKey,
  });
}
