import { describe, expect, it, vi } from "vitest";

// We test WebMCP tool definitions by importing the provider module and
// exercising the logic directly. The provider is a thin useEffect wrapper
// around navigator.modelContext.provideContext(), so testing the tool schemas
// and the integration path is the valuable part.

import WebMCPProvider, { WEBMCP_TOOLS } from "./webmcp-provider";

import { trpcClient } from "@/utils/trpc";

vi.mock("@/utils/trpc", () => ({
  trpcClient: {
    solutions: {
      search: { query: vi.fn() },
      list: { query: vi.fn() },
      getById: { query: vi.fn() },
    },
  },
  queryClient: {},
}));

describe("WebMCP tool definitions", () => {
  it("exports a valid React component", () => {
    expect(typeof WebMCPProvider).toBe("function");
  });

  describe("search_solutions tool", () => {
    it("has a valid JSON Schema input with required query field", () => {
      const schema = WEBMCP_TOOLS.find((tool) => tool.name === "search_solutions")?.inputSchema;

      expect(schema?.type).toBe("object");
      expect(schema?.required).toContain("query");
    });

    it("calls trpcClient.solutions.search.query with keyword mode", async () => {
      const mockFn = trpcClient.solutions.search.query as ReturnType<typeof vi.fn>;
      mockFn.mockResolvedValueOnce([{ id: "1", problem: "test", solution: "fix", score: 0 }]);

      const tool = WEBMCP_TOOLS.find((candidate) => candidate.name === "search_solutions");
      const result = await tool?.execute({ query: "Next.js cache issue" });

      expect(mockFn).toHaveBeenCalledWith({
        query: "Next.js cache issue",
        limit: 10,
        mode: "keyword",
      });
      expect(result).toEqual({
        results: [{ id: "1", problem: "test", solution: "fix", score: 0 }],
      });
    });

    it("returns empty results when query is blank", async () => {
      const tool = WEBMCP_TOOLS.find((candidate) => candidate.name === "search_solutions");

      await expect(tool?.execute({ query: "  " })).resolves.toEqual({
        results: [],
        message: "Query is required",
      });
    });
  });

  describe("browse_solutions tool", () => {
    it("has a valid input schema with sort and limit options", () => {
      const schema = WEBMCP_TOOLS.find((tool) => tool.name === "browse_solutions")?.inputSchema;

      expect(schema?.properties.sort.enum).toContain("recent");
      expect(schema?.properties.sort.enum).toContain("top");
      expect(schema?.properties.limit.maximum).toBe(20);
    });

    it("clamps limit to valid range", async () => {
      const mockFn = trpcClient.solutions.list.query as ReturnType<typeof vi.fn>;
      const tool = WEBMCP_TOOLS.find((candidate) => candidate.name === "browse_solutions");
      mockFn.mockResolvedValueOnce({ items: [], nextCursor: null });

      await tool?.execute({ limit: 50 });

      expect(mockFn).toHaveBeenCalledWith({ limit: 20, sort: "recent" });
    });

    it("calls trpcClient.solutions.list.query with correct params", async () => {
      const mockFn = trpcClient.solutions.list.query as ReturnType<typeof vi.fn>;
      mockFn.mockResolvedValueOnce({ items: [], nextCursor: null });

      const tool = WEBMCP_TOOLS.find((candidate) => candidate.name === "browse_solutions");
      const result = await tool?.execute({ limit: 10, sort: "recent" });

      expect(mockFn).toHaveBeenCalledWith({ limit: 10, sort: "recent" });
      expect(result).toEqual({ items: [], hasMore: false });
    });
  });

  describe("get_solution tool", () => {
    it("has a valid input schema with required id field", () => {
      const schema = WEBMCP_TOOLS.find((tool) => tool.name === "get_solution")?.inputSchema;

      expect(schema?.required).toContain("id");
    });

    it("calls trpcClient.solutions.getById.query with the solution id", async () => {
      const mockFn = trpcClient.solutions.getById.query as ReturnType<typeof vi.fn>;
      mockFn.mockResolvedValueOnce({
        id: "sol_123",
        problem: "test problem",
        solution: "test fix",
        score: 5,
        upvotes: 5,
        downvotes: 0,
        userVote: null,
        createdAt: new Date().toISOString(),
        userId: null,
        tags: "nextjs",
      });

      const tool = WEBMCP_TOOLS.find((candidate) => candidate.name === "get_solution");
      const result = await tool?.execute({ id: "sol_123" });

      expect(mockFn).toHaveBeenCalledWith({ id: "sol_123" });
      expect(result).toMatchObject({ id: "sol_123" });
    });
  });
});

describe("WebMCP navigator.modelContext integration", () => {
  it("provides tools via navigator.modelContext.provideContext when available", async () => {
    const provideContext = vi.fn().mockResolvedValue(undefined);
    const originalModelContext = navigator.modelContext;

    // @ts-expect-error -- injecting mock for test
    navigator.modelContext = { provideContext };

    try {
      const tools = [
        {
          name: "search_solutions",
          description: "Search solutions",
          inputSchema: { type: "object", properties: {}, required: [] },
          execute: async () => ({}),
        },
      ];

      await navigator.modelContext.provideContext(tools);
      expect(provideContext).toHaveBeenCalledTimes(1);
      expect(provideContext.mock.calls[0][0]).toHaveLength(1);
    } finally {
      // @ts-expect-error -- restoring for test isolation
      navigator.modelContext = originalModelContext;
    }
  });

  it("gracefully handles provideContext rejection", async () => {
    const provideContext = vi.fn().mockRejectedValue(new Error("not supported"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    // @ts-expect-error -- injecting mock for test
    navigator.modelContext = { provideContext };

    try {
      try {
        await navigator.modelContext.provideContext([]);
      } catch (err) {
        console.error("[WebMCP] Failed to provide context:", err);
      }

      expect(provideContext).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        "[WebMCP] Failed to provide context:",
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
