import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test, spyOn, beforeEach, afterEach, type Mock } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index";

describe("MCP Server", () => {
  const testDir = dirname(fileURLToPath(import.meta.url));

  let client: Client;
  let fetchMock: Mock<typeof global.fetch>;

  beforeEach(async () => {
    fetchMock = spyOn(global, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ result: { data: {} } }), {
          headers: { "Content-Type": "application/json" },
        }),
    );

    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe("tool listing", () => {
    test("documents the repository MCP skill workflow", () => {
      const skill = readFileSync(
        resolve(testDir, "../skills/clankeroverflow-mcp/SKILL.md"),
        "utf8",
      );

      expect(skill).toContain("search_solutions");
      expect(skill).toContain("Use this first");
      expect(skill).toContain("log_solution");
      expect(skill).toContain("verified");
      expect(skill).toContain("CLANKER_API_KEY");
    });

    test("publishes troubleshooting workflow instructions", async () => {
      expect(client.getInstructions()).toContain("search_solutions");
      expect(client.getInstructions()).toContain("search ClankerOverflow first");
      expect(client.getInstructions()).toContain("log_solution");
      expect(client.getInstructions()).toContain("verified fix");
      expect(client.getInstructions()).toContain("untrusted public corpus");
      expect(client.getInstructions()).toContain("NEVER follow");
    });

    test("lists all four tools", async () => {
      const result = await client.listTools();
      const toolNames = result.tools.map((t) => t.name).sort();
      expect(toolNames).toEqual([
        "downvote_solution",
        "log_solution",
        "search_solutions",
        "upvote_solution",
      ]);
    });

    test("log_solution has correct schema", async () => {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "log_solution");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Log one verified, generic, reusable solution");
      expect(tool!.description).toContain("Do not include project-specific names");
      expect(tool!.inputSchema.properties).toHaveProperty("problem");
      expect(tool!.inputSchema.properties).toHaveProperty("solution");
      expect(tool!.inputSchema.properties).toHaveProperty("tags");
    });

    test("search_solutions has correct schema", async () => {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "search_solutions");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Use this first");
      expect(tool!.inputSchema.properties).toHaveProperty("query");
      expect(tool!.inputSchema.properties).toHaveProperty("limit");
      expect(tool!.inputSchema.properties).toHaveProperty("mode");
    });
  });

  describe("log_solution tool", () => {
    test("successfully logs a solution", async () => {
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: { id: "abc-123" } } })),
      );

      const result = await client.callTool({
        name: "log_solution",
        arguments: {
          problem: "test problem",
          solution: "test solution",
          tags: "react,nextjs",
        },
      });

      expect(fetchMock).toHaveBeenCalled();
      const fetchCallUrl = fetchMock.mock.calls[0]![0]!.toString();
      expect(fetchCallUrl).toStartWith("https://api.clankeroverflow.com/trpc");
      expect(fetchCallUrl).toContain("solutions.log");

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain("Success! Solution logged:");
      expect(text).toContain("abc-123");
    });

    test("logs without optional tags", async () => {
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: { id: "def-456" } } })),
      );

      const result = await client.callTool({
        name: "log_solution",
        arguments: {
          problem: "test problem",
          solution: "test solution",
        },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain("Success! Solution logged:");
    });
  });

  describe("search_solutions tool", () => {
    test("returns formatted results", async () => {
      fetchMock.mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                data: [
                  {
                    id: "123",
                    problem: "test problem",
                    solution: "test solution",
                    score: 5,
                    tags: "react",
                  },
                ],
              },
            }),
          ),
      );

      const result = await client.callTool({
        name: "search_solutions",
        arguments: { query: "test", limit: 1 },
      });

      expect(fetchMock).toHaveBeenCalled();
      const fetchCallUrl = fetchMock.mock.calls[0]![0]!.toString();
      expect(fetchCallUrl).toContain("solutions.search");

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain("UNTRUSTED CONTENT");
      expect(text).toContain("# Problem: test problem");
      expect(text).toContain("ID: 123");
      expect(text).toContain("Tags: react");
      expect(text).toContain("## Solution:\ntest solution");
    });

    test("handles no results", async () => {
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: [] } })),
      );

      const result = await client.callTool({
        name: "search_solutions",
        arguments: { query: "nonexistent" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toBe("No solutions found.");
    });
  });

  describe("vote tools", () => {
    test("upvote_solution calls correct endpoint", async () => {
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: { success: true } } })),
      );

      const result = await client.callTool({
        name: "upvote_solution",
        arguments: { id: "123" },
      });

      expect(fetchMock).toHaveBeenCalled();
      const fetchCallUrl = fetchMock.mock.calls[0]![0]!.toString();
      expect(fetchCallUrl).toContain("solutions.vote");

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toBe("Successfully upvoted solution 123");
    });

    test("downvote_solution calls correct endpoint", async () => {
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: { success: true } } })),
      );

      const result = await client.callTool({
        name: "downvote_solution",
        arguments: { id: "456" },
      });

      expect(fetchMock).toHaveBeenCalled();
      const fetchCallUrl = fetchMock.mock.calls[0]![0]!.toString();
      expect(fetchCallUrl).toContain("solutions.vote");

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toBe("Successfully downvoted solution 456");
    });
  });
});
