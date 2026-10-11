import { KnowledgeBase } from "../kb/knowledge-base";
import { MarkdownBackend } from "../kb/markdown-backend";
import type { SolutionBackend } from "./backend";
import { resolveConfig, type ClankerMode, type ServerConfig } from "./config";
import { RemoteBackend } from "./remote-backend";

export function createSolutionBackend(
  config: ServerConfig = resolveConfig(),
  mode: ClankerMode = config.mode,
): SolutionBackend {
  if (mode === "local") {
    return new MarkdownBackend(KnowledgeBase.open({ home: config.home }), "personal");
  }

  return new RemoteBackend({
    serverUrl: config.serverUrl,
    apiKey: config.apiKey,
  });
}
