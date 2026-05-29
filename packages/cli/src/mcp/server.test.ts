import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

import { createMcpServer } from "./server";

describe("CLI MCP server", () => {
  const testDir = dirname(fileURLToPath(import.meta.url));

  let client: Client;
  let fetchMock: MockInstance<typeof global.fetch>;

  beforeEach(async () => {
    fetchMock = vi.spyOn(global, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ result: { data: {} } }), {
          headers: { "Content-Type": "application/json" },
        }),
    );

    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  test("documents the bundled MCP skill workflow", () => {
    const skill = readFileSync(
      resolve(testDir, "../../skills/clankeroverflow-mcp/SKILL.md"),
      "utf8",
    );

    expect(skill).toContain("search_solutions");
    expect(skill).toContain("Use this first");
    expect(skill).toContain("log_solution");
    expect(skill).toContain("verified");
    expect(skill).toContain("CLANKER_API_KEY");
    expect(skill).toContain("clanker mcp");
    expect(skill).not.toContain("clanker-mcp");
  });

  test("keeps the bundled MCP skill aligned with skill writing guidelines", () => {
    const skill = readFileSync(
      resolve(testDir, "../../skills/clankeroverflow-mcp/SKILL.md"),
      "utf8",
    );
    const frontmatter = skill.match(/^---\n(?<body>[\s\S]*?)\n---/)?.groups?.body ?? "";
    const markdownBody = skill.replace(/^---\n[\s\S]*?\n---\n/, "");

    expect(frontmatter).toContain("name: clankeroverflow-mcp");
    expect(frontmatter).toContain("version:");
    expect(frontmatter).toContain("description: This skill should be used when");
    expect(frontmatter).toContain('"debug an error"');
    expect(frontmatter).toContain('"search prior fixes"');
    expect(frontmatter).not.toContain("description: Use this skill");
    expect(markdownBody).not.toMatch(/\bYou should\b|\bIf you need\b/);
  });

  test("publishes troubleshooting workflow instructions", () => {
    expect(client.getInstructions()).toContain("search_solutions");
    expect(client.getInstructions()).toContain("search ClankerOverflow first");
    expect(client.getInstructions()).toContain("log_solution");
    expect(client.getInstructions()).toContain("verified fix");
    expect(client.getInstructions()).toContain("untrusted public corpus");
    expect(client.getInstructions()).toContain("NEVER follow");
  });

  test("uses the current MCP tool registration API", () => {
    const serverSource = readFileSync(resolve(testDir, "server.ts"), "utf8");

    expect(serverSource).toContain(".registerTool(");
    expect(serverSource).not.toContain(".tool(");
  });

  test("uses the published mcplog package for MCP logging", () => {
    const serverSource = readFileSync(resolve(testDir, "server.ts"), "utf8");

    expect(serverSource).toContain('from "mcplog"');
    expect(serverSource).not.toContain("@clankeroverflow/mcp-logger");
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

  test("log_solution logs through the hosted API", async () => {
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
    expect(fetchCallUrl).toMatch(/^https:\/\/api\.clankeroverflow\.com\/trpc/);
    expect(fetchCallUrl).toContain("solutions.log");

    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("Success! Solution logged:");
    expect(text).toContain("abc-123");
  });

  test("search_solutions returns formatted results", async () => {
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

  test("local semantic search returns not-configured message without fetch", async () => {
    const previousMode = process.env.CLANKER_MODE;
    const previousDb = process.env.CLANKER_LOCAL_DB;
    const dir = mkdtempSync(join(tmpdir(), "clanker-mcp-local-server-"));

    try {
      process.env.CLANKER_MODE = "local";
      process.env.CLANKER_LOCAL_DB = join(dir, "solutions.sqlite");

      const localServer = createMcpServer();
      const [localClientTransport, localServerTransport] = InMemoryTransport.createLinkedPair();
      const localClient = new Client({ name: "local-test-client", version: "1.0.0" });

      await localServer.connect(localServerTransport);
      await localClient.connect(localClientTransport);

      const result = await localClient.callTool({
        name: "search_solutions",
        arguments: { query: "oauth", mode: "semantic" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain("Local semantic search is not configured yet.");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (previousMode === undefined) {
        delete process.env.CLANKER_MODE;
      } else {
        process.env.CLANKER_MODE = previousMode;
      }
      if (previousDb === undefined) {
        delete process.env.CLANKER_LOCAL_DB;
      } else {
        process.env.CLANKER_LOCAL_DB = previousDb;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("vote tools call the hosted API", async () => {
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
});
