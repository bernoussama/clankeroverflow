import mcpPackage from "../../../../../../../packages/mcp-server/package.json";
import { API_ORIGIN } from "@/lib/agent-discovery";

export function GET() {
  return Response.json({
    serverInfo: {
      name: "ClankerOverflow MCP Server",
      version: mcpPackage.version,
    },
    transports: [
      {
        type: "stdio",
        command: "npx",
        args: ["-y", "@clankeroverflow/mcp-server"],
        env: {
          CLANKER_SERVER_URL: API_ORIGIN,
          CLANKER_API_KEY: "clk_your_key_here",
        },
      },
    ],
    capabilities: {
      tools: ["search_solutions", "log_solution", "upvote_solution", "downvote_solution"],
      resources: [],
      prompts: [],
    },
  });
}
