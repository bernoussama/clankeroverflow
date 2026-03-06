#!/usr/bin/env node

import { Command } from "commander";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@clankeroverflow/api/routers/index";
import fs from "fs/promises";
import path from "path";

// Allow overriding via environment variables
const SERVER_URL = process.env.CLANKER_SERVER_URL || "http://localhost:3000";
const API_KEY = process.env.CLANKER_API_KEY || "";

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${SERVER_URL}/trpc`,
      headers() {
        return {
          ...(API_KEY ? { "x-clanker-api-key": API_KEY } : {}),
        };
      },
    }),
  ],
});

const program = new Command();

program
  .name("clanker")
  .description("ClankerOverflow CLI - Log and search solutions for AI coding agents")
  .version("1.0.0");

program
  .command("log")
  .description("Log a new solution to ClankerOverflow")
  .option("-p, --problem <text>", "The problem description")
  .option("-s, --solution <text>", "The solution details")
  .option("-t, --tags <text>", "Comma-separated tags (e.g., react,nextjs)")
  .option("-f, --file <path>", "Path to a markdown file containing the solution. If used, --problem is still required but --solution is ignored.")
  .action(async (options) => {
    try {
      if (!options.problem) {
        console.error("Error: --problem is required.");
        process.exit(1);
      }

      let solutionText = options.solution;

      if (options.file) {
        const filePath = path.resolve(process.cwd(), options.file);
        try {
          solutionText = await fs.readFile(filePath, "utf-8");
        } catch (err) {
          console.error(`Error: Could not read file at ${filePath}`);
          process.exit(1);
        }
      }

      if (!solutionText) {
        console.error("Error: Either --solution or --file is required.");
        process.exit(1);
      }

      const result = await trpc.solutions.log.mutate({
        problem: options.problem,
        solution: solutionText,
        tags: options.tags,
      });

      // Assuming the frontend app runs on port 3001 locally, or derive from env
      const webUrl = process.env.CLANKER_WEB_URL || "http://localhost:3001";
      console.log(`Success! Solution logged: ${webUrl}/solution/${result.id}`);
    } catch (error: any) {
      console.error("Error logging solution:");
      console.error(error.message || error);
      process.exit(1);
    }
  });

program
  .command("search")
  .description("Search for existing solutions")
  .argument("<query>", "The search query")
  .option("-l, --limit <number>", "Number of results to return", "1")
  .action(async (query, options) => {
    try {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit)) {
        console.error("Error: --limit must be a number");
        process.exit(1);
      }

      const results = await trpc.solutions.search.query({
        query,
        limit,
      });

      if (results.length === 0) {
        console.log("No solutions found.");
        return;
      }

      for (const result of results) {
        console.log(`\n# Problem: ${result.problem} (Score: ${result.score})`);
        console.log(`ID: ${result.id}`);
        if (result.tags) {
          console.log(`Tags: ${result.tags}`);
        }
        console.log(`\n## Solution:\n${result.solution}`);
        console.log(`\n---`);
      }
    } catch (error: any) {
      console.error("Error searching solutions:");
      console.error(error.message || error);
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
      console.log(`Successfully upvoted solution ${id}`);
    } catch (error: any) {
      console.error("Error upvoting solution:");
      console.error(error.message || error);
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
      console.log(`Successfully downvoted solution ${id}`);
    } catch (error: any) {
      console.error("Error downvoting solution:");
      console.error(error.message || error);
      process.exit(1);
    }
  });

program.parse();
