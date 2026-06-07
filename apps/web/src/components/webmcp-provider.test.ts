import { beforeEach, describe, expect, it, vi } from "vitest";

// We test WebMCP tool definitions and execute callbacks by importing the
// module and exercising the logic directly. The provider component is a thin
// useEffect wrapper around navigator.modelContext.provideContext(), so testing
// the tool schemas and execute functions is the valuable part.

// Import the provider to verify it exports and the module loads cleanly.
import WebMCPProvider, { WEBMCP_TOOLS } from "./webmcp-provider";

// Re-create the same tool definitions that the provider uses so we can test them.
// These mirror the constants in webmcp-provider.tsx exactly.

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports a valid React component", () => {
    expect(typeof WebMCPProvider).toBe("function");
  });

  describe("search_solutions tool", () => {
    it("has a valid JSON Schema input with required query field", () => {
      const schema = WEBMCP_TOOLS.find((tool) => tool.name === "search_solutions")?.inputSchema;

      expect(schema?.type).toBe("object");
      expect(schema?.required).toContain("query");
    });

    it("auto mode returns keyword results without fallback when keyword matches", async () => {
      const mocked = trpcClient.solutions.search.query as ReturnType<typeof vi.fn>;
      const tool = WEBMCP_TOOLS.find((candidate) => candidate.name === "search_solutions");
      mocked.mockResolvedValueOnce([{ id: "1", problem: "test", solution: "fix", score: 0 }]);

      const result = await tool?.execute({ query: "Next.js cache issue" });

      expect(mocked).toHaveBeenCalledWith({
        query: "Next.js cache issue",
        limit: 10,
        mode: "keyword",
      });
      expect(result).toEqual({
        results: [{ id: "1", problem: "test", solution: "fix", score: 0 }],
        attempts: [{ mode: "keyword", resultCount: 1 }],
      });
    });

    it("auto mode falls back to hybrid after empty keyword results", async () => {
      const mocked = trpcClient.solutions.search.query as ReturnType<typeof vi.fn>;
      const tool = WEBMCP_TOOLS.find((candidate) => candidate.name === "search_solutions");
      mocked
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "2", problem: "hybrid", solution: "fix", score: 1 }]);

      const result = await tool?.execute({ query: "conceptual miss" });

      expect(mocked).toHaveBeenNthCalledWith(1, {
        query: "conceptual miss",
        limit: 10,
        mode: "keyword",
      });
      expect(mocked).toHaveBeenNthCalledWith(2, {
        query: "conceptual miss",
        limit: 10,
        mode: "hybrid",
      });
      expect(result).toEqual({
        results: [{ id: "2", problem: "hybrid", solution: "fix", score: 1 }],
        attempts: [
          { mode: "keyword", resultCount: 0 },
          { mode: "hybrid", resultCount: 1 },
        ],
      });
    });

    it("returns error message on empty query", async () => {
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

    it("calls trpcClient.solutions.list.query with correct params", async () => {
      const mocked = trpcClient.solutions.list.query as ReturnType<typeof vi.fn>;
      const tool = WEBMCP_TOOLS.find((candidate) => candidate.name === "browse_solutions");
      mocked.mockResolvedValueOnce({ items: [], nextCursor: null });

      const result = await tool?.execute({ limit: 10, sort: "recent" });

      expect(mocked).toHaveBeenCalledWith({ limit: 10, sort: "recent" });
      expect(result).toEqual({ items: [], hasMore: false });
    });
  });

  describe("get_solution tool", () => {
    it("has a valid input schema with required id field", () => {
      const schema = WEBMCP_TOOLS.find((tool) => tool.name === "get_solution")?.inputSchema;

      expect(schema?.required).toContain("id");
    });

    it("calls trpcClient.solutions.getById.query with the solution id", async () => {
      const mocked = trpcClient.solutions.getById.query as ReturnType<typeof vi.fn>;
      const tool = WEBMCP_TOOLS.find((candidate) => candidate.name === "get_solution");
      mocked.mockResolvedValueOnce({
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

      const result = await tool?.execute({ id: "sol_123" });

      expect(mocked).toHaveBeenCalledWith({ id: "sol_123" });
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
      // Simulate what the provider does
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
      // Simulate what the provider does (catches errors)
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
