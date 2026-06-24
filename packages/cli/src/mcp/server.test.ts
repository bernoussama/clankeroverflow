import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

import { createMcpServer } from "./server";
import { resolveConfig } from "./config";

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
    expect(frontmatter).not.toContain("version:");
    expect(frontmatter).toContain("description: Use this skill BEFORE implementing");
    expect(frontmatter).toContain("framework-specific");
    expect(frontmatter).toContain("version-sensitive");
    expect(frontmatter).toContain("Search ClankerOverflow FIRST");
    expect(frontmatter).toContain("EADDRINUSE");
    expect(frontmatter).toContain("The search cost is near-zero");
    expect(markdownBody).not.toMatch(/\bYou should\b|\bIf you need\b/);
  });

  test("publishes troubleshooting workflow instructions", () => {
    expect(client.getInstructions()).toContain("search_solutions");
    expect(client.getInstructions()).toContain("search ClankerOverflow first");
    expect(client.getInstructions()).toContain("smallest distinctive literal fingerprint");
    expect(client.getInstructions()).toContain("Use tags as relevance signals");
    expect(client.getInstructions()).toContain("Upvote only a tried result");
    expect(client.getInstructions()).toContain("Downvote only a tried result");
    expect(client.getInstructions()).toContain("log_solution");
    expect(client.getInstructions()).toContain("verified, generic, reusable, sanitized fixes");
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

  test("lists all MCP tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name).sort();
    expect(toolNames).toEqual([
      "clanker_status",
      "downvote_solution",
      "log_solution",
      "search_solutions",
      "upvote_solution",
    ]);
  });

  test("defaults search_solutions to auto search", async () => {
    const result = await client.listTools();
    const searchTool = result.tools.find((tool) => tool.name === "search_solutions");

    expect(searchTool?.description).toContain("smallest distinctive literal fingerprint");
    expect(searchTool?.description).toContain("tags as relevance signals");
    expect(searchTool?.inputSchema.properties?.query.description).toContain(
      "Smallest distinctive keyword fingerprint",
    );
    expect(searchTool?.inputSchema.properties?.mode.default).toBe("auto");
    expect(searchTool?.inputSchema.properties?.source.default).toBe("configured");
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
    expect(text).toContain("Search attempts: keyword exact returned 1.");
    expect(text).toContain("UNTRUSTED CONTENT");
    expect(text).toContain("# Problem: test problem");
    expect(text).toContain("ID: 123");
    expect(text).toContain("Tags: react");
    expect(text).toContain("## Solution:\ntest solution");
  });

  test("auto search reports unavailable hybrid fallback without an API key", async () => {
    const previousApiKey = process.env.CLANKER_API_KEY;
    delete process.env.CLANKER_API_KEY;

    try {
      const unauthenticatedServer = createMcpServer();
      const [unauthenticatedClientTransport, unauthenticatedServerTransport] =
        InMemoryTransport.createLinkedPair();
      const unauthenticatedClient = new Client({
        name: "unauthenticated-test-client",
        version: "1.0.0",
      });

      await unauthenticatedServer.connect(unauthenticatedServerTransport);
      await unauthenticatedClient.connect(unauthenticatedClientTransport);

      fetchMock
        .mockImplementationOnce(async () => new Response(JSON.stringify({ result: { data: [] } })))
        .mockImplementationOnce(async () => new Response(JSON.stringify({ result: { data: [] } })));

      const result = await unauthenticatedClient.callTool({
        name: "search_solutions",
        arguments: { query: "missing", limit: 1 },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(text).toContain("keyword exact returned 0");
      expect(text).toContain("keyword tiered returned 0");
      expect(text).toContain("CLANKER_API_KEY is required for hosted hybrid fallback");
      expect(text).toContain("No solutions found.");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.CLANKER_API_KEY;
      } else {
        process.env.CLANKER_API_KEY = previousApiKey;
      }
    }
  });

  test("auto search falls back to hybrid after empty keyword results when authenticated", async () => {
    const previousApiKey = process.env.CLANKER_API_KEY;
    process.env.CLANKER_API_KEY = "test-key";

    try {
      const authenticatedServer = createMcpServer();
      const [authenticatedClientTransport, authenticatedServerTransport] =
        InMemoryTransport.createLinkedPair();
      const authenticatedClient = new Client({
        name: "authenticated-test-client",
        version: "1.0.0",
      });

      await authenticatedServer.connect(authenticatedServerTransport);
      await authenticatedClient.connect(authenticatedClientTransport);

      fetchMock
        .mockImplementationOnce(async () => new Response(JSON.stringify({ result: { data: [] } })))
        .mockImplementationOnce(
          async () =>
            new Response(
              JSON.stringify({
                result: {
                  data: [
                    {
                      id: "hybrid-1",
                      problem: "hybrid problem",
                      solution: "hybrid solution",
                      score: 2,
                      tags: "search",
                    },
                  ],
                },
              }),
            ),
        );

      const result = await authenticatedClient.callTool({
        name: "search_solutions",
        arguments: { query: "conceptual miss", limit: 1 },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(text).toContain("Search attempts: keyword exact returned 0; hybrid returned 1.");
      expect(text).toContain("ID: hybrid-1");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.CLANKER_API_KEY;
      } else {
        process.env.CLANKER_API_KEY = previousApiKey;
      }
    }
  });

  test("local semantic search returns not-configured message without fetch", async () => {
    const previousMode = process.env.CLANKER_MODE;
    const previousDb = process.env.CLANKER_LOCAL_DB;
    const previousSemantic = process.env.CLANKER_LOCAL_SEMANTIC;
    const dir = mkdtempSync(join(tmpdir(), "clanker-mcp-local-server-"));

    try {
      process.env.CLANKER_MODE = "local";
      process.env.CLANKER_LOCAL_DB = join(dir, "solutions.sqlite");
      process.env.CLANKER_LOCAL_SEMANTIC = "0";

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
      if (previousSemantic === undefined) {
        delete process.env.CLANKER_LOCAL_SEMANTIC;
      } else {
        process.env.CLANKER_LOCAL_SEMANTIC = previousSemantic;
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
    expect(text).toBe("Successfully upvoted remote solution 123");
  });

  test("remote search and voting overrides do not change local logging", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-mcp-source-"));
    const config = resolveConfig({
      CLANKER_MODE: "local",
      CLANKER_LOCAL_DB: join(dir, "solutions.sqlite"),
      CLANKER_LOCAL_SEMANTIC: "0",
      CLANKER_API_KEY: "clk_test",
    });
    const sourceServer = createMcpServer(config);
    const [sourceClientTransport, sourceServerTransport] = InMemoryTransport.createLinkedPair();
    const sourceClient = new Client({ name: "source-client", version: "1.0.0" });
    await sourceServer.connect(sourceServerTransport);
    await sourceClient.connect(sourceClientTransport);

    try {
      fetchMock
        .mockImplementationOnce(
          async () =>
            new Response(
              JSON.stringify({
                result: {
                  data: [
                    {
                      id: "remote-1",
                      problem: "remote problem",
                      solution: "remote solution",
                      score: 1,
                      tags: null,
                    },
                  ],
                },
              }),
            ),
        )
        .mockImplementationOnce(
          async () => new Response(JSON.stringify({ result: { data: { success: true } } })),
        );

      const search = await sourceClient.callTool({
        name: "search_solutions",
        arguments: { query: "remote", source: "remote", mode: "keyword" },
      });
      expect((search.content as Array<{ text: string }>)[0]?.text).toContain("Source: remote");

      await sourceClient.callTool({
        name: "upvote_solution",
        arguments: { id: "remote-1", source: "remote" },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const logged = await sourceClient.callTool({
        name: "log_solution",
        arguments: { problem: "private problem", solution: "private solution" },
      });
      expect((logged.content as Array<{ text: string }>)[0]?.text).toContain(
        "Solution logged locally",
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      await sourceClient.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
