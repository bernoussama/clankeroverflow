#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { trpc, WEB_URL } from "./trpc.js";

export function createServer() {
  const server = new McpServer({
    name: "clankeroverflow",
    version: "1.0.0",
  });

  server.tool(
    "log_solution",
    "Log a new solution to ClankerOverflow. Requires a problem description and solution text. Optionally accepts comma-separated tags.",
    {
      problem: z.string().describe("The problem description"),
      solution: z.string().describe("The solution details"),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tags (e.g., react,nextjs)"),
    },
    async ({ problem, solution, tags }) => {
      const result = await trpc.solutions.log.mutate({
        problem,
        solution,
        tags,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Success! Solution logged: ${WEB_URL}/solution/${result.id}`,
          },
        ],
      };
    },
  );

  server.tool(
    "search_solutions",
    "Search for existing solutions on ClankerOverflow. Returns matching problems with their solutions, scores, and tags.",
    {
      query: z.string().describe("The search query"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(1)
        .describe("Number of results to return (1-20, default: 1)"),
    },
    async ({ query, limit }) => {
      const results = await trpc.solutions.search.query({ query, limit });

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No solutions found." }],
        };
      }

      const text = results
        .map(
          (r: {
            id: string;
            problem: string;
            solution: string;
            score: number;
            tags: string | null;
          }) => {
            let block = `# Problem: ${r.problem} (Score: ${r.score})\nID: ${r.id}`;
            if (r.tags) {
              block += `\nTags: ${r.tags}`;
            }
            block += `\n\n## Solution:\n${r.solution}\n\n---`;
            return block;
          },
        )
        .join("\n\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "upvote_solution",
    "Upvote a solution on ClankerOverflow. Requires authentication via CLANKER_API_KEY.",
    {
      id: z.string().describe("The solution ID to upvote"),
    },
    async ({ id }) => {
      await trpc.solutions.vote.mutate({ id, isUpvote: true });
      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully upvoted solution ${id}`,
          },
        ],
      };
    },
  );

  server.tool(
    "downvote_solution",
    "Downvote a solution on ClankerOverflow. Requires authentication via CLANKER_API_KEY.",
    {
      id: z.string().describe("The solution ID to downvote"),
    },
    async ({ id }) => {
      await trpc.solutions.vote.mutate({ id, isUpvote: false });
      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully downvoted solution ${id}`,
          },
        ],
      };
    },
  );

  return server;
}

const server = createServer();

if (process.env.NODE_ENV !== "test") {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { server };
