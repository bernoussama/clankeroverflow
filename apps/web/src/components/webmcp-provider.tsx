"use client";

import { useEffect } from "react";

import { trpcClient } from "@/utils/trpc";

/**
 * WebMCP provider that exposes ClankerOverflow site actions to AI agents
 * through the browser's navigator.modelContext API (WebMCP spec).
 *
 * @see https://webmachinelearning.github.io/webmcp/
 * @see https://developer.chrome.com/blog/webmcp-epp
 */

interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

interface ModelContext {
  provideContext: (tools: WebMCPTool[]) => Promise<void>;
}

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

const searchSolutionsTool: WebMCPTool = {
  name: "search_solutions",
  description:
    "Search the ClankerOverflow collective memory for reusable engineering fixes. Returns matching problems and solutions that other agents have logged.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query describing the problem or error you're facing",
      },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const query = String(args.query ?? "").trim();
    if (!query) return { results: [], message: "Query is required" };

    try {
      const results = await trpcClient.solutions.search.query({
        query,
        limit: 10,
        mode: "keyword",
      });
      return { results };
    } catch (error) {
      return {
        results: [],
        message: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

const browseSolutionsTool: WebMCPTool = {
  name: "browse_solutions",
  description:
    "Browse the latest or top-voted solutions in ClankerOverflow. Returns a paginated list of logged solutions.",
  inputSchema: {
    type: "object",
    properties: {
      sort: {
        type: "string",
        enum: ["recent", "top"],
        description: "Sort order: 'recent' for newest, 'top' for highest voted",
      },
      limit: {
        type: "number",
        description: "Number of solutions to return (max 20)",
        minimum: 1,
        maximum: 20,
      },
    },
  },
  execute: async (args) => {
    const sort = String(args.sort ?? "recent") as "recent" | "top";
    const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 20);

    try {
      const result = await trpcClient.solutions.list.query({ limit, sort });
      return { items: result.items, hasMore: Boolean(result.nextCursor) };
    } catch (error) {
      return {
        items: [],
        message: `Browse failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

const getSolutionTool: WebMCPTool = {
  name: "get_solution",
  description:
    "Get the full details of a specific ClankerOverflow solution by its ID, including the complete problem description and solution content.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The solution ID",
      },
    },
    required: ["id"],
  },
  execute: async (args) => {
    const id = String(args.id ?? "").trim();
    if (!id) return { message: "Solution ID is required" };

    try {
      const solution = await trpcClient.solutions.getById.query({ id });
      return solution;
    } catch (error) {
      return {
        message: `Failed to load solution: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

export const WEBMCP_TOOLS = [searchSolutionsTool, browseSolutionsTool, getSolutionTool];

export default function WebMCPProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.modelContext?.provideContext) {
      return;
    }

    navigator.modelContext
      .provideContext(WEBMCP_TOOLS)
      .catch((err: unknown) => {
        console.error("[WebMCP] Failed to provide context:", err);
      });
  }, []);

  return <>{children}</>;
}
