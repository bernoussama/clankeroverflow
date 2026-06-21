#!/usr/bin/env node

import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import packageJson from "../package.json";
import { searchWithAutoFallback } from "./mcp/auto-search.js";
import type { SearchMode } from "./mcp/backend.js";
import { resolveConfig } from "./mcp/config.js";
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

function parseSearchLimit(value: string) {
  const limit = parseInt(value, 10);
  if (isNaN(limit)) {
    console.error(pc.red(pc.bold("✖ Error: ")) + pc.red("--limit must be a number"));
    process.exit(1);
  }
  return limit;
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

async function searchAndPrint(
  backend: Pick<ReturnType<typeof createSolutionBackend>, "search">,
  input: {
    query: string;
    limit: number;
    mode: SearchMode;
    allowHybridFallback: boolean;
    fallbackUnavailableReason: string;
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

  console.log(formatSearchResults(sanitized, sanitizedAttempts));
}

export function createProgram(options: CreateProgramOptions = {}) {
  const program = new Command();
  const runMcpServer = options.startMcpServer ?? startMcpServer;

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
      "auto (keyword first, then hybrid on empty results when available), keyword, semantic, or hybrid",
      "auto",
    )
    .action(async (query, options) => {
      try {
        const limit = parseSearchLimit(options.limit);
        const mode = parseSearchMode(options.mode);
        const config = resolveConfig();
        const backend = createSolutionBackend(config);
        await searchAndPrint(backend, {
          query,
          limit,
          mode,
          allowHybridFallback:
            config.mode === "local" ? config.localSemantic.enabled : Boolean(config.apiKey),
          fallbackUnavailableReason:
            config.mode === "local"
              ? "local semantic search is not configured"
              : "CLANKER_API_KEY is required for hosted hybrid fallback",
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
    .action(async (id) => {
      try {
        const backend = createSolutionBackend(resolveConfig());
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
    .action(async (id) => {
      try {
        const backend = createSolutionBackend(resolveConfig());
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
    .description("Start the ClankerOverflow MCP server over stdio")
    .action(async () => {
      await runMcpServer();
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
      "auto (keyword first, then hybrid on empty results when available), keyword, semantic, or hybrid",
      "auto",
    )
    .action(async (query, options) => {
      try {
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
        const limit =
          options.limit === undefined ? undefined : Number.parseInt(String(options.limit), 10);
        if (options.limit !== undefined && (limit === undefined || Number.isNaN(limit))) {
          console.error(pc.red(pc.bold("✖ Error: ")) + pc.red("--limit must be a number"));
          process.exit(1);
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
