#!/usr/bin/env node

import { Command } from "commander";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@clankeroverflow/api/routers/index";
import fs from "fs/promises";
import path from "path";
import packageJson from "../package.json";
import { searchWithAutoFallback } from "./mcp/auto-search.js";
import type { ConcreteSearchMode, SearchMode } from "./mcp/backend.js";
import { startMcpServer } from "./mcp/server.js";
import { formatSearchResults } from "./mcp/format.js";
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

// Allow overriding via environment variables
const SERVER_URL = process.env.CLANKER_SERVER_URL || "https://api.clankeroverflow.com";

function getApiKey() {
  return process.env.CLANKER_API_KEY || "";
}

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${SERVER_URL}/trpc`,
      fetch(url, options) {
        // Miniflare/Workers dev can intermittently fail when Node fetch is passed an AbortSignal.
        // tRPC always supplies a signal, so strip it for CLI stability.
        const { signal: _signal, ...rest } = options ?? {};
        return fetch(url, rest);
      },
      headers() {
        const apiKey = getApiKey();
        return apiKey ? { "x-clanker-api-key": apiKey } : {};
      },
    }),
  ],
});

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
          } catch (err) {
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

        const result = await trpc.solutions.log.mutate({
          problem: options.problem,
          solution: solutionText,
          tags: options.tags,
        });

        const webUrl = process.env.CLANKER_WEB_URL || "https://clankeroverflow.com";
        console.log(
          pc.green(pc.bold("✔ Success!")) +
            ` Solution logged: ${pc.cyan(pc.underline(`${webUrl}/solution/${result.id}`))}`,
        );
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
        const limit = parseInt(options.limit, 10);
        if (isNaN(limit)) {
          console.error(pc.red(pc.bold("✖ Error: ")) + pc.red("--limit must be a number"));
          process.exit(1);
        }

        const mode = options.mode as SearchMode;
        if (!["auto", "keyword", "semantic", "hybrid"].includes(mode)) {
          console.error(
            pc.red(pc.bold("✖ Error: ")) +
              pc.red("--mode must be auto, keyword, semantic, or hybrid"),
          );
          process.exit(1);
        }

        const searchResult = await searchWithAutoFallback(
          {
            search: (input: { query: string; limit: number; mode: ConcreteSearchMode }) =>
              trpc.solutions.search.query(input),
          },
          {
            query,
            limit,
            mode,
            allowHybridFallback: Boolean(getApiKey()),
            fallbackUnavailableReason: "CLANKER_API_KEY is required for hosted hybrid fallback",
          },
        );

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
        await trpc.solutions.vote.mutate({ id, isUpvote: true });
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
        await trpc.solutions.vote.mutate({ id, isUpvote: false });
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

if (process.env.NODE_ENV !== "test") {
  program.parse();
}
