import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { knowledgeForTeam } from "@clankeroverflow/api/kb/registry";
import type { TeamKnowledge } from "@clankeroverflow/kb";
import { z } from "zod";

export function createHostedMcpServer(team: TeamKnowledge) {
  const server = new McpServer({ name: "clankeroverflow", version: "1.5.0" });
  server.registerTool(
    "kb_search",
    {
      description: "Search this team's markdown knowledge base.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(5),
      }),
    },
    async ({ query, limit }) => ({
      content: [
        {
          type: "text" as const,
          text:
            team
              .search(query, { limit })
              .map((hit) => `${hit.title} (${hit.path})`)
              .join("\n") || "No matching documents.",
        },
      ],
    }),
  );
  server.registerTool(
    "kb_browse",
    {
      description: "Return the generated catalog for the team knowledge base.",
      inputSchema: z.object({ area: z.string().optional() }),
    },
    async ({ area }) => ({ content: [{ type: "text" as const, text: team.browse(area) }] }),
  );
  server.registerTool(
    "kb_read",
    {
      description: "Read one team document.",
      inputSchema: z.object({ path: z.string().min(1) }),
    },
    async ({ path }) => ({
      content: [{ type: "text" as const, text: team.read(path)?.markdown ?? "No document found." }],
    }),
  );
  return server;
}

export async function handleHostedMcp(request: Request, teamId: string) {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createHostedMcpServer(knowledgeForTeam(teamId));
  await server.connect(transport);
  return transport.handleRequest(request);
}

export function teamChanges(teamId: string, since: number) {
  return knowledgeForTeam(teamId).changesSince(since);
}
