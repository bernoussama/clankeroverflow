import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Database } from "@clankeroverflow/db";
import type { TeamKnowledge } from "@clankeroverflow/kb";
import {
  DrizzleTeamRepository,
  R2ObjectStore,
  isR2Bucket,
  openTeamSession,
  dreamPersistedTeams,
} from "@clankeroverflow/api/kb/repository";
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

export function objectStoreFromEnv(env: unknown) {
  const bucket = (env as { KB_BUCKET?: unknown } | undefined)?.KB_BUCKET;
  return isR2Bucket(bucket) ? new R2ObjectStore(bucket) : undefined;
}

export async function openHostedTeam(db: Database, env: unknown, teamId: string) {
  return openTeamSession({
    repository: new DrizzleTeamRepository(db),
    objectStore: objectStoreFromEnv(env),
    teamId,
  });
}

export async function handleHostedMcp(
  request: Request,
  db: Database,
  env: unknown,
  teamId: string,
) {
  const session = await openHostedTeam(db, env, teamId);
  if (session.created) await session.commit();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createHostedMcpServer(session.team);
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function runScheduledDreams(db: Database, env: unknown) {
  const model = dreamModelFromEnv();
  return dreamPersistedTeams({
    repository: new DrizzleTeamRepository(db),
    objectStore: objectStoreFromEnv(env),
    tokenBudget: 4000,
    model,
  });
}

export function dreamModelFromEnv() {
  const url = process.env.KB_DREAM_URL?.trim();
  const apiKey = process.env.KB_DREAM_API_KEY?.trim();
  const model = process.env.KB_DREAM_MODEL?.trim() || "gpt-4.1-mini";
  if (!url || !apiKey) return null;
  return {
    async complete(prompt: string, tokenBudget: number) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: tokenBudget,
          messages: [
            {
              role: "user",
              content: `Rewrite these notes as one draft memory line. Do not mark it verified.\n\n${prompt}`,
            },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Dream model failed (${response.status}).`);
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content?.trim() || "No dream output.";
      return { text, tokens: body.usage?.total_tokens ?? Math.ceil(text.length / 4) };
    },
  };
}
