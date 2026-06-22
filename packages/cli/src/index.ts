#!/usr/bin/env node

import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import packageJson from "../package.json";
import { searchWithAutoFallback } from "./mcp/auto-search.js";
import type { SearchMode } from "./mcp/backend.js";
import {
  getConfigPath,
  modeForSource,
  readPersistedConfig,
  resolveConfig,
  toPersistedConfig,
  writePersistedConfig,
  type BackendSource,
} from "./mcp/config.js";
import { createSolutionBackend } from "./mcp/create-backend.js";
import { startMcpServer } from "./mcp/server.js";
import { formatSearchResults } from "./mcp/format.js";
import { LocalBackend } from "./mcp/local-backend.js";
import { downloadDefaultLocalModel } from "./mcp/local-semantic.js";
import { hasSetupFailures, setupAgents, type Agent, type SkillSelection } from "./setup.js";
import pc from "picocolors";

type CreateProgramOptions = {
  startMcpServer?: () => Promise<void>;
};

/** Strip C0/C1 control characters except newline/tab/cr from untrusted text */
function sanitizeForTerminal(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, "");
}

function formatLocalStatus(dbPath: string, status: Awaited<ReturnType<LocalBackend["status"]>>) {
  return [
    pc.bold("ClankerOverflow local status"),
    `SQLite: ${pc.cyan(dbPath)}`,
    `Semantic: ${status.enabled ? pc.green("enabled") : pc.yellow("disabled")}`,
    `Solutions: ${status.totalSolutions}`,
    `Embeddings: ${status.embeddedSolutions} current, ${status.pendingEmbeddings} pending`,
    `Model: ${status.modelPath || "(not configured)"}`,
    `Model file: ${status.modelValid ? pc.green("valid GGUF") : pc.yellow(status.modelError ?? "missing")}`,
    `sqlite-vec: ${
      status.sqliteVecAvailable
        ? pc.green("available")
        : pc.red(status.sqliteVecError ?? "unavailable")
    }`,
    `node-llama-cpp: ${
      status.embedderAvailable
        ? pc.green("available")
        : pc.red(status.embedderError ?? "unavailable")
    }`,
  ].join("\n");
}

function formatDoctor(checks: Array<{ name: string; ok: boolean; detail: string }>) {
  return [
    pc.bold("ClankerOverflow local doctor"),
    ...checks.map((check) => {
      const mark = check.ok ? pc.green("✔") : pc.yellow("!");
      return `${mark} ${check.name}: ${check.detail}`;
    }),
  ].join("\n");
}

const SEARCH_LIMIT_MIN = 1;
const SEARCH_LIMIT_MAX = 20;

function parseSearchLimit(value: string) {
  const limit = Number(value);
  if (!Number.isInteger(limit)) {
    console.error(pc.red(pc.bold("✖ Error: ")) + pc.red("--limit must be an integer"));
    process.exit(1);
  }
  if (limit < SEARCH_LIMIT_MIN || limit > SEARCH_LIMIT_MAX) {
    console.error(
      pc.red(pc.bold("✖ Error: ")) +
        pc.red(`--limit must be between ${SEARCH_LIMIT_MIN} and ${SEARCH_LIMIT_MAX}`),
    );
    process.exit(1);
  }
  return limit;
}

function parseSearchQuery(value: string) {
  if (!value || !value.trim()) {
    console.error(pc.red(pc.bold("✖ Error: ")) + pc.red("search query must not be empty"));
    process.exit(1);
  }
  return value;
}

/**
 * When a positional argument (like a search query) starts with `-`, commander
 * treats it as an unknown option. Detect that case and point the user at the
 * `--` separator so they can still search for `-1`, `v2.0-beta-1`, etc.
 */
function enhanceLeadingDashError(error: unknown): void {
  if (!(error instanceof Error)) return;
  const commanderError = error as Error & { code?: string };
  if (commanderError.code !== "commander.unknownOption") return;
  // The offending token appears in the message, e.g. `error: unknown option '-1'`.
  const tokenMatch = error.message.match(/unknown option '(.+)'/);
  const token = tokenMatch?.[1];
  if (!token || !token.startsWith("-")) return;
  if (token === "-h" || token === "--help" || token === "-V" || token === "--version") return;
  console.error(pc.yellow(`Tip: "${token}" looks like a search query, not a flag.`));
  console.error(
    pc.yellow(`     Use "--" to separate options from the query:  clanker search -- ${token}`),
  );
}

function parseSearchMode(value: string) {
  const mode = value as SearchMode;
  if (!["auto", "keyword", "semantic", "hybrid"].includes(mode)) {
    console.error(
      pc.red(pc.bold("✖ Error: ")) + pc.red("--mode must be auto, keyword, semantic, or hybrid"),
    );
    process.exit(1);
  }
  return mode;
}

function parseBackendSource(value: string): BackendSource {
  if (!["configured", "local", "remote"].includes(value)) {
    throw new Error("--source must be configured, local, or remote");
  }
  return value as BackendSource;
}

function parseBooleanSetting(value: string) {
  if (["1", "true", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "off"].includes(value.toLowerCase())) return false;
  throw new Error("value must be true or false");
}

async function setConfigValue(key: string, value: string) {
  const resolved = resolveConfig();
  const persisted = readPersistedConfig() ?? toPersistedConfig(resolved);
  switch (key) {
    case "mode":
      if (value !== "local" && value !== "remote") throw new Error("mode must be local or remote");
      persisted.mode = value;
      break;
    case "local.databasePath":
      persisted.local.databasePath = value;
      break;
    case "local.semantic":
      persisted.local.semantic = parseBooleanSetting(value);
      break;
    case "local.modelId":
      persisted.local.modelId = value;
      break;
    case "local.modelPath":
      persisted.local.modelPath = value;
      break;
    case "local.dimensions": {
      const dimensions = Number(value);
      if (!Number.isInteger(dimensions) || dimensions <= 0) {
        throw new Error("local.dimensions must be a positive integer");
      }
      persisted.local.dimensions = dimensions;
      break;
    }
    case "remote.serverUrl":
      persisted.remote.serverUrl = value;
      break;
    case "remote.webUrl":
      persisted.remote.webUrl = value;
      break;
    default:
      throw new Error(
        "unknown setting; use mode, local.databasePath, local.semantic, local.modelId, local.modelPath, local.dimensions, remote.serverUrl, or remote.webUrl",
      );
  }
  return writePersistedConfig(persisted);
}

async function searchAndPrint(
  backend: Pick<ReturnType<typeof createSolutionBackend>, "search">,
  input: {
    query: string;
    limit: number;
    mode: SearchMode;
    allowHybridFallback: boolean;
    fallbackUnavailableReason: string;
    source?: "local" | "remote";
  },
) {
  const searchResult = await searchWithAutoFallback(backend, input);
  const sanitized = searchResult.results.map((result) => ({
    id: result.id,
    problem: sanitizeForTerminal(result.problem),
    solution: sanitizeForTerminal(result.solution),
    score: result.score,
    tags: result.tags ? sanitizeForTerminal(result.tags) : null,
  }));
  const sanitizedAttempts = searchResult.attempts.map((attempt) => ({
    ...attempt,
    error: attempt.error ? sanitizeForTerminal(attempt.error) : undefined,
  }));

  const formatted = formatSearchResults(sanitized, sanitizedAttempts);
  console.log(input.source ? `Source: ${input.source}\n${formatted}` : formatted);
}

export function createProgram(options: CreateProgramOptions = {}) {
  const program = new Command();
  const runMcpServer = options.startMcpServer ?? startMcpServer;

  // Attach the exit override before defining any subcommand so it propagates to
  // them (subcommands capture the callback when they are created).
  program.exitOverride((error: Error & { code?: string }) => {
    enhanceLeadingDashError(error);
    if (error.code === "commander.help" || error.code === "commander.version") {
      process.exit(0);
    }
    process.exit(1);
  });

  program
    .name("clanker")
    .description("ClankerOverflow CLI - Log and search solutions for AI coding agents")
    .version(packageJson.version);

  program
    .command("log")
    .description("Log one verified, generic, reusable solution to ClankerOverflow")
    .option("-p, --problem <text>", "The problem description")
    .option("-s, --solution <text>", "The solution details")
    .option("-t, --tags <text>", "Comma-separated tags (e.g., react,nextjs)")
    .option(
      "-f, --file <path>",
      "Path to a markdown file containing the solution. If used, --problem is still required but --solution is ignored.",
    )
    .action(async (options) => {
      try {
        if (!options.problem) {
          console.error(pc.red(pc.bold("✖ Error: ")) + pc.red("--problem is required."));
          process.exit(1);
        }

        let solutionText = options.solution;

        if (options.file) {
          const filePath = path.resolve(process.cwd(), options.file);
          try {
            solutionText = await fs.readFile(filePath, "utf-8");
          } catch {
            console.error(
              pc.red(pc.bold("✖ Error: ")) + pc.red(`Could not read file at ${filePath}`),
            );
            process.exit(1);
          }
        }

        if (!solutionText) {
          console.error(
            pc.red(pc.bold("✖ Error: ")) + pc.red("Either --solution or --file is required."),
          );
          process.exit(1);
        }

        const config = resolveConfig();
        const backend = createSolutionBackend(config);
        const result = await backend.log({
          problem: options.problem,
          solution: solutionText,
          tags: options.tags,
        });

        if (config.mode === "local") {
          console.log(
            pc.green(pc.bold("✔ Success!")) + ` Solution logged locally: ${pc.cyan(result.id)}`,
          );
          if (result.warning) console.log(pc.yellow(result.warning));
        } else {
          console.log(
            pc.green(pc.bold("✔ Success!")) +
              ` Solution logged: ${pc.cyan(pc.underline(`${config.webUrl}/solution/${result.id}`))}`,
          );
        }
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error logging solution:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  program
    .command("search")
    .description("Search for existing solutions")
    .argument("<query>", "The search query")
    .option("-l, --limit <number>", "Number of results to return", "1")
    .option(
      "-m, --mode <mode>",
      "auto (exact keyword, then hybrid, then tiered keyword fallback), keyword, semantic, or hybrid",
      "auto",
    )
    .option("--source <source>", "configured, local, or remote", "configured")
    .action(async (query, options) => {
      try {
        parseSearchQuery(query);
        const limit = parseSearchLimit(options.limit);
        const mode = parseSearchMode(options.mode);
        const config = resolveConfig();
        const source = parseBackendSource(options.source);
        const backendMode = modeForSource(config, source);
        const backend = createSolutionBackend(config, backendMode);
        await searchAndPrint(backend, {
          query,
          limit,
          mode,
          allowHybridFallback:
            backendMode === "local" ? config.localSemantic.enabled : Boolean(config.apiKey),
          fallbackUnavailableReason:
            backendMode === "local"
              ? "local semantic search is not configured"
              : "CLANKER_API_KEY is required for hosted hybrid fallback",
          source: backendMode,
        });
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error searching solutions:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  program
    .command("upvote")
    .description("Upvote a solution")
    .argument("<id>", "The solution ID")
    .option("--source <source>", "configured, local, or remote", "configured")
    .action(async (id, options) => {
      try {
        const config = resolveConfig();
        const backend = createSolutionBackend(
          config,
          modeForSource(config, parseBackendSource(options.source)),
        );
        await backend.vote({ id, isUpvote: true });
        console.log(pc.green(pc.bold("▲ Upvoted")) + ` solution ${pc.cyan(id)}`);
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error upvoting solution:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  program
    .command("downvote")
    .description("Downvote a solution")
    .argument("<id>", "The solution ID")
    .option("--source <source>", "configured, local, or remote", "configured")
    .action(async (id, options) => {
      try {
        const config = resolveConfig();
        const backend = createSolutionBackend(
          config,
          modeForSource(config, parseBackendSource(options.source)),
        );
        await backend.vote({ id, isUpvote: false });
        console.log(pc.red(pc.bold("▼ Downvoted")) + ` solution ${pc.cyan(id)}`);
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error downvoting solution:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  program
    .command("mcp")
    .description(
      "Start the ClankerOverflow MCP server over stdio (keeps the local model warm across searches)",
    )
    .action(async () => {
      await runMcpServer();
    });

  const configCommand = program
    .command("config")
    .description("Inspect or update persisted settings");

  configCommand
    .command("show", { isDefault: true })
    .description("Show the effective non-secret configuration")
    .option("--json", "Print machine-readable JSON")
    .action((options) => {
      try {
        const config = resolveConfig();
        const output = {
          configPath: config.configPath,
          persisted: config.hasPersistedConfig,
          mode: config.mode,
          local: {
            databasePath: config.localDbPath,
            semantic: config.localSemantic.enabled,
            modelId: config.localSemantic.modelId,
            modelPath: config.localSemantic.modelPath,
            dimensions: config.localSemantic.dimensions,
          },
          remote: { serverUrl: config.serverUrl, webUrl: config.webUrl },
        };
        if (options.json) console.log(JSON.stringify(output, null, 2));
        else {
          console.log(pc.bold("ClankerOverflow configuration"));
          console.log(`Path: ${pc.cyan(output.configPath)}`);
          console.log(`Persisted: ${output.persisted ? "yes" : "no (legacy/default fallback)"}`);
          console.log(`Mode: ${pc.cyan(output.mode)}`);
          console.log(`Local database: ${output.local.databasePath}`);
          console.log(`Local semantic: ${output.local.semantic ? "enabled" : "disabled"}`);
          console.log(`Remote API: ${output.remote.serverUrl}`);
          console.log(`Remote web: ${output.remote.webUrl}`);
        }
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error reading configuration:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  configCommand
    .command("path")
    .description("Print the persisted configuration path")
    .action(() => console.log(getConfigPath()));

  configCommand
    .command("set")
    .description("Set one persisted configuration value")
    .argument("<key>", "Configuration key")
    .argument("<value>", "Configuration value")
    .action(async (key, value) => {
      try {
        const configPath = await setConfigValue(key, value);
        console.log(pc.green(pc.bold("✔ Configuration updated")) + ` - ${pc.cyan(configPath)}`);
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error updating configuration:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  const local = program.command("local").description("Inspect and maintain local SQLite mode");

  local
    .command("status")
    .description("Show local SQLite and semantic search status")
    .option("--db <path>", "Local SQLite database path")
    .option("--json", "Print machine-readable JSON")
    .action(async (options) => {
      try {
        const config = resolveConfig({
          ...process.env,
          CLANKER_MODE: "local",
          ...(options.db ? { CLANKER_LOCAL_DB: options.db } : {}),
        });
        const backend = new LocalBackend(config.localDbPath, { semantic: config.localSemantic });
        const status = await backend.status();
        if (options.json) {
          console.log(
            JSON.stringify(
              { mode: "local", dbPath: config.localDbPath, semantic: status },
              null,
              2,
            ),
          );
          return;
        }
        console.log(formatLocalStatus(config.localDbPath, status));
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error reading local status:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  local
    .command("doctor")
    .description("Diagnose local SQLite semantic search setup")
    .option("--db <path>", "Local SQLite database path")
    .option("--json", "Print machine-readable JSON")
    .action(async (options) => {
      try {
        const config = resolveConfig({
          ...process.env,
          CLANKER_MODE: "local",
          ...(options.db ? { CLANKER_LOCAL_DB: options.db } : {}),
        });
        const backend = new LocalBackend(config.localDbPath, { semantic: config.localSemantic });
        const status = await backend.status();
        const checks = [
          { name: "sqlite database", ok: true, detail: config.localDbPath },
          {
            name: "local semantic enabled",
            ok: status.enabled,
            detail: status.enabled ? "enabled" : "disabled by CLANKER_LOCAL_SEMANTIC=0/false/off",
          },
          {
            name: "sqlite-vec",
            ok: status.sqliteVecAvailable,
            detail: status.sqliteVecError ?? "available",
          },
          {
            name: "node-llama-cpp",
            ok: status.embedderAvailable,
            detail: status.embedderError ?? "available",
          },
          {
            name: "model file",
            ok: status.modelValid,
            detail: status.modelError ?? status.modelPath,
          },
          {
            name: "embedding freshness",
            ok: status.pendingEmbeddings === 0,
            detail: `${status.pendingEmbeddings} pending`,
          },
        ];
        if (options.json) {
          console.log(
            JSON.stringify(
              { mode: "local", dbPath: config.localDbPath, checks, semantic: status },
              null,
              2,
            ),
          );
          return;
        }
        console.log(formatDoctor(checks));
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error running local doctor:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  local
    .command("search")
    .description("Search the local SQLite solutions database")
    .argument("<query>", "The search query")
    .option("--db <path>", "Local SQLite database path")
    .option("-l, --limit <number>", "Number of results to return", "1")
    .option(
      "-m, --mode <mode>",
      "auto (exact keyword, then hybrid, then tiered keyword fallback), keyword, semantic, or hybrid",
      "auto",
    )
    .action(async (query, options) => {
      try {
        parseSearchQuery(query);
        const limit = parseSearchLimit(options.limit);
        const mode = parseSearchMode(options.mode);
        const config = resolveConfig({
          ...process.env,
          CLANKER_MODE: "local",
          ...(options.db ? { CLANKER_LOCAL_DB: options.db } : {}),
        });
        const backend = new LocalBackend(config.localDbPath, { semantic: config.localSemantic });
        await searchAndPrint(backend, {
          query,
          limit,
          mode,
          allowHybridFallback: config.localSemantic.enabled,
          fallbackUnavailableReason: "local semantic search is not configured",
          source: "local",
        });
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error searching local solutions:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  local
    .command("embed")
    .description("Download the local model if needed and embed pending local solutions")
    .option("--db <path>", "Local SQLite database path")
    .option("--force", "Rebuild all local embeddings")
    .option("--limit <number>", "Maximum solutions to embed in this run")
    .action(async (options) => {
      try {
        const config = resolveConfig({
          ...process.env,
          CLANKER_MODE: "local",
          CLANKER_LOCAL_SEMANTIC: "1",
          ...(options.db ? { CLANKER_LOCAL_DB: options.db } : {}),
        });
        const limit = options.limit === undefined ? undefined : Number(String(options.limit));
        if (options.limit !== undefined) {
          if (limit === undefined || !Number.isInteger(limit) || limit < SEARCH_LIMIT_MIN) {
            console.error(
              pc.red(pc.bold("✖ Error: ")) +
                pc.red(`--limit must be an integer of at least ${SEARCH_LIMIT_MIN}`),
            );
            process.exit(1);
          }
        }
        const model = await downloadDefaultLocalModel(config.localSemantic.modelPath);
        const backend = new LocalBackend(config.localDbPath, { semantic: config.localSemantic });
        const result = await backend.embedPending({ force: Boolean(options.force), limit });
        console.log(
          pc.green(pc.bold("✔ Local embeddings ready")) +
            ` - ${result.embedded} solution(s) embedded; model ${model.downloaded ? "downloaded to" : "checked at"} ${pc.cyan(config.localSemantic.modelPath)}`,
        );
      } catch (error: any) {
        console.error(pc.red(pc.bold("✖ Error embedding local solutions:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  program
    .command("setup")
    .description("Detect installed coding agents and configure ClankerOverflow")
    .option(
      "--agent <agents>",
      "Comma-separated agents to configure: codex,claude,opencode,pi,cursor",
    )
    .option("--api-key <key>", "API key for non-interactive setup")
    .option("--no-api-key", "Skip or remove stored MCP API keys")
    .option("--server-url <url>", "ClankerOverflow API server URL")
    .option("--mode <mode>", "Persisted backend mode: local or remote")
    .option("--local", "Configure MCP for private local SQLite mode")
    .option("--local-semantic", "Enable local semantic search and write local model settings")
    .option("--local-db <path>", "Local SQLite database path for --local setup")
    .option("--local-model-path <path>", "GGUF embedding model path for --local-semantic")
    .option("--target <dirs>", "Comma-separated additional target directories for the skill")
    .option("--skill <skill>", "Skill for --target: mcp, cli, or both", "mcp")
    .option("--claude-plugin <identifier>", "Claude marketplace plugin identifier")
    .option("--dry-run", "Show planned changes without modifying configuration")
    .option("--uninstall", "Remove ClankerOverflow integrations")
    .action(async (options) => {
      try {
        const results = await setupAgents({
          agents: options.agent?.split(",").map((agent: string) => agent.trim()) as
            | Agent[]
            | undefined,
          apiKey: options.apiKey,
          noApiKey: options.apiKey === false,
          serverUrl: options.serverUrl,
          mode: options.mode,
          local: options.local || options.localSemantic,
          localDb: options.localDb,
          localModelPath: options.localModelPath,
          localSemantic: options.localSemantic,
          targets: options.target?.split(",").map((target: string) => target.trim()),
          skill: options.skill as SkillSelection,
          claudePlugin: options.claudePlugin,
          dryRun: options.dryRun,
          uninstall: options.uninstall,
        });
        const title = options.dryRun ? "Planned Setup Changes" : "ClankerOverflow Setup Results";
        console.log(`\n${pc.bold(pc.magenta(`=== ${title} ===`))}`);
        for (const result of results) {
          let statusIndicator = "";
          if (result.status === "configured") {
            statusIndicator = pc.green("✔ configured");
          } else if (result.status === "removed") {
            statusIndicator = pc.red("✘ removed");
          } else if (result.status === "skipped") {
            statusIndicator = pc.yellow("○ skipped");
          } else {
            statusIndicator = pc.red(pc.bold("▲ failed"));
          }
          console.log(
            `  ${pc.bold(result.agent.padEnd(15))} ${statusIndicator} - ${pc.dim(result.detail)}`,
          );
        }
        console.log();
        if (hasSetupFailures(results)) process.exit(1);
      } catch (error: any) {
        console.error("");
        console.error(pc.red(pc.bold("✖ Error installing ClankerOverflow:")));
        console.error(pc.red(error.message || error));
        process.exit(1);
      }
    });

  return program;
}

const program = createProgram();
export { program };

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  program.parse();
}
