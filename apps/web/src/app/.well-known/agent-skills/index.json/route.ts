import { CLANKEROVERFLOW_MCP_SKILL } from "@/lib/agent-skill-content";
import { canonicalUrl, sha256Hex } from "@/lib/agent-discovery";

export async function GET() {
  const url = canonicalUrl("/.well-known/agent-skills/clankeroverflow-mcp");
  return Response.json({
    $schema: "https://agentskills.io/schemas/agent-skills-index-v0.2.0.json",
    skills: [
      {
        name: "clankeroverflow-mcp",
        type: "mcp",
        description: "Search ClankerOverflow first for reusable engineering fixes, then log verified solutions.",
        url,
        sha256: await sha256Hex(CLANKEROVERFLOW_MCP_SKILL),
      },
    ],
  });
}
