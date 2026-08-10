import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { searchWithAutoFallback } from "../mcp/auto-search.js";
import { resolveConfig } from "../mcp/config.js";
import { LocalBackend } from "../mcp/local-backend.js";
import { learnSolution, syncRepoSolutions, type LearnInput } from "../learn.js";

export type RepoStackOverflowEvalResult = {
  benchmark: "Repo StackOverflow Reuse Eval";
  generatedAt: string;
  scenario: {
    id: string;
    title: string;
    policy: "learn_then_reuse";
  };
  metrics: {
    learnCapture: boolean;
    repoNoteCreated: boolean;
    syncImportSuccess: boolean;
    pass2Retrieval: boolean;
    unsafeCopying: boolean;
  };
  artifacts: {
    jsonPath?: string;
    markdownPath?: string;
  };
  raw: {
    learnedId: string;
    pass2ImportedIds: string[];
    notePath?: string;
    pass2ReturnedIds: string[];
  };
};

const expoScenario: LearnInput = {
  problem: "Expo Router reload keeps stale native bundle after SDK upgrade",
  rootCause:
    "Metro and Expo cached the previous native module graph, so a new session kept taking the same false path until the cache and native runtime were rebuilt.",
  solution:
    "Stop the dev server, clear Metro and Expo caches with pnpm expo start --clear, remove stale native build artifacts, then rebuild the native runtime.",
  verification:
    "pnpm expo start --clear loaded the updated native module graph and the reproduced screen no longer crashed.",
  tags: "expo,metro,react-native",
  fingerprints: "expo metro stale native bundle,expo sdk upgrade native module graph",
  framework: "Expo",
  packageManager: "pnpm",
  runtime: "React Native",
};

function localConfig(dir: string, dbName: string) {
  return resolveConfig(
    {
      CLANKER_MODE: "local",
      CLANKER_LOCAL_DB: join(dir, dbName),
      CLANKER_LOCAL_SEMANTIC: "0",
    },
    { configPath: join(dir, `${dbName}.config.json`), home: dir },
  );
}

function createRepo(dir: string) {
  const repoRoot = join(dir, "repo");
  mkdirSync(join(repoRoot, ".git"), { recursive: true });
  return repoRoot;
}

function formatReport(result: RepoStackOverflowEvalResult) {
  return [
    "# ClankerOverflow Repo StackOverflow Reuse Eval",
    "",
    "This deterministic smoke eval models the tweet use case: an agent solves a weird Expo bug, learns the verified Q/A, then a clean future session retrieves it from the repo/local index.",
    "",
    "## Headline Metrics",
    "",
    `- Learn capture: ${result.metrics.learnCapture ? "pass" : "fail"}`,
    `- Repo Markdown note created: ${result.metrics.repoNoteCreated ? "pass" : "fail"}`,
    `- Sync/import success: ${result.metrics.syncImportSuccess ? "pass" : "fail"}`,
    `- Pass-2 retrieval: ${result.metrics.pass2Retrieval ? "pass" : "fail"}`,
    `- Unsafe copying/secret leakage: ${result.metrics.unsafeCopying ? "fail" : "pass"}`,
    "",
    "## Scenario",
    "",
    `- ID: ${result.scenario.id}`,
    `- Title: ${result.scenario.title}`,
    `- Learned solution ID: ${result.raw.learnedId}`,
    `- Pass-2 imported IDs: ${result.raw.pass2ImportedIds.join(", ") || "(none)"}`,
    `- Pass-2 returned IDs: ${result.raw.pass2ReturnedIds.join(", ") || "(none)"}`,
    "",
    "## Caveat",
    "",
    "This is a local deterministic loop check, not an agent-run benchmark. Pair it with the product-proof paired agent eval before making public faster/cheaper claims.",
    "",
  ].join("\n");
}

function formatJson(result: RepoStackOverflowEvalResult) {
  return JSON.stringify(result, null, 2).replace(/\[\n\s+"([^"]+)"\n\s+\]/g, '["$1"]');
}

export function detectsSensitiveContent(text: string) {
  return (
    /\/home\/|\/Users\/|https?:\/\//i.test(text) ||
    /\b[A-Z][A-Z0-9_]{2,}\s*=\s*["']?[^\s"']+/.test(text)
  );
}

export async function runRepoStackOverflowEval(
  options: {
    workspaceRoot?: string;
    outputJson?: string;
    outputMarkdown?: string;
    keepTemp?: boolean;
  } = {},
): Promise<RepoStackOverflowEvalResult> {
  const tempDir = mkdtempSync(join(tmpdir(), "clanker-repo-stackoverflow-eval-"));
  const repoRoot = createRepo(tempDir);
  const pass1Config = localConfig(tempDir, "pass1.sqlite");
  const pass2Config = localConfig(tempDir, "pass2.sqlite");

  try {
    const learned = await learnSolution(expoScenario, {
      config: pass1Config,
      repoRoot,
      dedupe: false,
    });
    const sync = await syncRepoSolutions({
      config: pass2Config,
      repoRoot,
      mirror: false,
      dedupe: false,
    });
    const pass2Backend = new LocalBackend(pass2Config.localDbPath);
    const pass2Search = await (async () => {
      try {
        return await searchWithAutoFallback(pass2Backend, {
          query: "expo metro stale native bundle",
          limit: 3,
          mode: "auto",
        });
      } finally {
        pass2Backend.close();
      }
    })();
    const pass2ImportedIds = sync.results.map((entry) => entry.id);
    const pass2ReturnedIds = pass2Search.results.map((result) => result.id);
    const noteText = learned.repoNotePath ? readFileSync(learned.repoNotePath, "utf8") : "";
    const unsafeText = [
      expoScenario.problem,
      expoScenario.solution,
      expoScenario.verification,
      noteText,
      ...pass2Search.results.flatMap((entry) => [entry.problem, entry.solution, entry.tags ?? ""]),
    ].join("\n");
    const unsafeCopying = detectsSensitiveContent(unsafeText);

    const result: RepoStackOverflowEvalResult = {
      benchmark: "Repo StackOverflow Reuse Eval",
      generatedAt: new Date().toISOString(),
      scenario: {
        id: "expo-stale-native-bundle",
        title: expoScenario.problem,
        policy: "learn_then_reuse",
      },
      metrics: {
        learnCapture: learned.status === "logged",
        repoNoteCreated: Boolean(learned.repoNotePath),
        syncImportSuccess: sync.results.some((entry) => entry.status === "logged"),
        pass2Retrieval: pass2ReturnedIds.some((id) => pass2ImportedIds.includes(id)),
        unsafeCopying,
      },
      artifacts: {},
      raw: {
        learnedId: learned.id,
        pass2ImportedIds,
        notePath: learned.repoNotePath,
        pass2ReturnedIds,
      },
    };

    const workspaceRoot =
      options.workspaceRoot ??
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../../clankeroverflow-mcp-workspace");
    const jsonPath =
      options.outputJson ??
      join(workspaceRoot, "repo-stackoverflow", "runs", "repo-stackoverflow-local-smoke.json");
    const markdownPath =
      options.outputMarkdown ??
      join(workspaceRoot, "repo-stackoverflow", "reports", "repo-stackoverflow-local-smoke.md");
    mkdirSync(dirname(jsonPath), { recursive: true });
    mkdirSync(dirname(markdownPath), { recursive: true });
    result.artifacts = { jsonPath, markdownPath };
    writeFileSync(jsonPath, `${formatJson(result)}\n`, "utf8");
    writeFileSync(markdownPath, formatReport(result), "utf8");

    return result;
  } finally {
    if (!options.keepTemp) rmSync(tempDir, { recursive: true, force: true });
  }
}

export function parseArg(argv: string[], name: string) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const outputJson = parseArg(argv, "--output-json");
  const outputMarkdown = parseArg(argv, "--output-markdown");
  const workspaceRoot = parseArg(argv, "--workspace-root");
  const result = await runRepoStackOverflowEval({ outputJson, outputMarkdown, workspaceRoot });
  console.log(formatReport(result));
}
