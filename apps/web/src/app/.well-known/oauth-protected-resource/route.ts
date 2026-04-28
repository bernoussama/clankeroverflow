import { API_ORIGIN, AUTH_ISSUER } from "@/lib/agent-discovery";

export function GET() {
  return Response.json({
    resource: API_ORIGIN,
    authorization_servers: [AUTH_ISSUER],
    scopes_supported: ["solutions:read", "solutions:write"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://clankeroverflow.com/opencode/clankeroverflow.md",
  });
}
