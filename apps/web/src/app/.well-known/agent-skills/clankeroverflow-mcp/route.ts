import { CLANKEROVERFLOW_MCP_SKILL } from "@/lib/agent-skill-content";
import { textResponse } from "@/lib/agent-discovery";

export function GET() {
  return textResponse(CLANKEROVERFLOW_MCP_SKILL, "text/markdown; charset=utf-8");
}
