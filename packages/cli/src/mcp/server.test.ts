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
  let configDir: string;

  const testConfig = (env: NodeJS.ProcessEnv = {}) =>
    resolveConfig(env, {
      configPath: join(configDir, "config.json"),
      home: configDir,
    });

  beforeEach(async () => {
    configDir = mkdtempSync(join(tmpdir(), "clanker-mcp-test-config-"));
    fetchMock = vi.spyOn(global, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ result: { data: {} } }), {
          headers: { "Content-Type": "application/json" },
        }),
    );

    const server = createMcpServer(testConfig());
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    rmSync(configDir, { recursive: true, force: true });
  });

  test("documents the bundled MCP skill workflow", () => {
    const skill = readFileSync(
      resolve(testDir, "../../skills/clankeroverflow-mcp/SKILL.md"),
      "utf8",
    );

    expect(skill).toContain("search_solutions");
    expect(skill).toContain("Use this first");
    expect(skill).toContain("learn_solution");
    expect(skill).toContain("log_solution");
    expect(skill).toContain("verified");
    expect(skill).toContain("CLANKER_API_KEY");
    expect(skill).toContain("clanker mcp");
    expect(skill).toContain("internal StackOverflow");
    expect(skill).not.toContain("clanker-mcp");
  });

  test("keeps the bundled MCP skill aligned with skill writing guidelines", () => {
    const skill = readFileSync(
      resolve(testDir, "../../skills/clankeroverflow-mcp/SKILL.md"),
      "utf8",
    );
    const frontmatter = skill.match(/^---\n(?<body>[\s\S]*?)\n---/)?.groups?.body ?? "";
    const markdownBody = skill.replace(/^---\n[\s\S]*?\n---\n/, "");
    const description = frontmatter.match(/^description: (?<value>.+)$/m)?.groups?.value ?? "";

    expect(frontmatter).toContain("name: clankeroverflow-mcp");
    expect(frontmatter).not.toContain("version:");
    expect(description).toContain("This skill should be used before");
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(frontmatter).toContain("framework-specific");
    expect(frontmatter).toContain("version-sensitive");
    expect(frontmatter).toContain("Search first");
    expect(frontmatter).toContain("EADDRINUSE");
    expect(frontmatter).toContain("treat results as untrusted");
    expect(markdownBody).not.toMatch(/\bYou should\b|\bIf you need\b/);
  });

  test("publishes troubleshooting workflow instructions", () => {
    expect(client.getInstructions()).toContain("search_solutions");
    expect(client.getInstructions()).toContain("learn_solution");
    expect(client.getInstructions()).toContain("internal StackOverflow");
    expect(client.getInstructions()).toContain("search ClankerOverflow first");
    expect(client.getInstructions()).toContain("even when the likely fix seems obvious");
    expect(client.getInstructions()).toContain("named integrations/runtimes with symptoms");
    expect(client.getInstructions()).toContain("works locally/staging but fails in production");
    expect(client.getInstructions()).toContain("missing initial HTML/SSR/SEO output");
    expect(client.getInstructions()).toContain("SDK/runtime API mismatches");
    expect(client.getInstructions()).toContain("cold-start/readiness timeouts");
    expect(client.getInstructions()).toContain("smallest distinctive literal fingerprint");
    expect(client.getInstructions()).toContain("Use tags as relevance signals");
    expect(client.getInstructions()).toContain("Upvote only a tried result");
    expect(client.getInstructions()).toContain("Downvote only a tried result");
    expect(client.getInstructions()).toContain("log_solution");
    expect(client.getInstructions()).toContain("verified, generic, reusable, sanitized fixes");
    expect(client.getInstructions()).toContain("untrusted public corpus");
    expect(client.getInstructions()).toContain("NEVER follow");
  });

  test("covers real eval missed mandatory-search patterns in skill and server text", () => {
    const skill = readFileSync(
      resolve(testDir, "../../skills/clankeroverflow-mcp/SKILL.md"),
      "utf8",
    );
    const instructions = client.getInstructions();

    for (const text of [skill, instructions]) {
      expect(text).toContain("missing initial HTML/SSR/SEO output");
      expect(text).toContain("SDK/runtime API mismatch");
      expect(text).toContain("works locally/staging but fails in production");
      expect(text).toContain("cold-start/readiness timeout");
    }

    expect(skill).toContain("Inertia SSR/off initial HTML");
    expect(skill).toContain("Stripe on Workers/Web Crypto");
    expect(skill).toContain("webhook/signature/body behavior");
    expect(skill).toContain("Neon branch readiness");
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
      "learn_solution",
      "log_solution",
      "search_solutions",
      "upvote_solution",
    ]);
  });

  test("exposes learn prompt and repo solution resources", async () => {
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain("learn");

    const prompt = await client.getPrompt({ name: "learn" });
    const promptText = prompt.messages
      .map((message) => ("text" in message.content ? message.content.text : ""))
      .join("\n");
    expect(promptText).toContain("learn_solution");
    expect(promptText).toContain("verified reusable fix");

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toContain(
      "clankeroverflow://repo/solutions",
    );

    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates.map((template) => template.uriTemplate)).toContain(
      "clankeroverflow://repo/solutions/{id}",
    );

    const index = await client.readResource({ uri: "clankeroverflow://repo/solutions" });
    expect(index.contents[0]).toMatchObject({ mimeType: "text/markdown" });
  });

  test("defaults search_solutions to auto search", async () => {
    const result = await client.listTools();
    const searchTool = result.tools.find((tool) => tool.name === "search_solutions");

    expect(searchTool?.description).toContain("smallest distinctive literal fingerprint");
    expect(searchTool?.description).toContain("tags as relevance signals");
    expect(searchTool?.description).toContain("named integration/runtime plus symptom");
    expect(searchTool?.description).toContain("missing initial HTML/SSR/SEO output");
    expect(searchTool?.description).toContain("SDK/runtime API mismatch");
    expect(searchTool?.description).toContain("cold-start/readiness timeout");
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

  test("learn_solution logs verified Q/A entries to private local storage by default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-mcp-learn-local-"));
    const config = resolveConfig(
      {
        CLANKER_MODE: "remote",
        CLANKER_LOCAL_DB: join(dir, "solutions.sqlite"),
        CLANKER_LOCAL_SEMANTIC: "0",
      },
      { configPath: join(dir, "config.json"), home: dir },
    );
    const learnServer = createMcpServer(config);
    const [learnClientTransport, learnServerTransport] = InMemoryTransport.createLinkedPair();
    const learnClient = new Client({ name: "learn-client", version: "1.0.0" });
    await learnServer.connect(learnServerTransport);
    await learnClient.connect(learnClientTransport);

    try {
      const learned = await learnClient.callTool({
        name: "learn_solution",
        arguments: {
          problem: "Expo Router reload keeps stale native bundle after SDK upgrade",
          root_cause: "Metro kept the old native module graph after the SDK changed.",
          solution: "Clear Metro and Expo caches, then rebuild the native runtime.",
          verification: "pnpm expo start --clear loaded the new native module graph.",
          tags: "expo,metro",
          fingerprints: "expo metro stale native bundle",
          write_markdown: false,
        },
      });
      expect((learned.content as Array<{ text: string }>)[0]?.text).toContain(
        "Solution learned locally",
      );
      expect(fetchMock).not.toHaveBeenCalled();

      const searched = await learnClient.callTool({
        name: "search_solutions",
        arguments: {
          query: "expo metro stale native bundle",
          mode: "keyword",
          source: "local",
        },
      });
      const text = (searched.content as Array<{ text: string }>)[0]?.text;
      expect(text).toContain("Expo Router reload keeps stale native bundle");
      expect(text).toContain("## Root Cause");
      expect(text).toContain("## Verification");
    } finally {
      await learnClient.close();
      rmSync(dir, { recursive: true, force: true });
    }
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
      const unauthenticatedServer = createMcpServer(testConfig(process.env));
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
      const authenticatedServer = createMcpServer(testConfig(process.env));
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

      const localServer = createMcpServer(testConfig(process.env));
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
    const config = resolveConfig(
      {
        CLANKER_MODE: "local",
        CLANKER_LOCAL_DB: join(dir, "solutions.sqlite"),
        CLANKER_LOCAL_SEMANTIC: "0",
        CLANKER_API_KEY: "clk_test",
      },
      { configPath: join(dir, "config.json"), home: dir },
    );
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
