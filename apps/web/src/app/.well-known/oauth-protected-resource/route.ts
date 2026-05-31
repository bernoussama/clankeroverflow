import { SITE_ORIGIN, API_ORIGIN, AUTH_ISSUER } from "@/lib/agent-discovery";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    resource: SITE_ORIGIN,
    authorization_servers: [AUTH_ISSUER],
    scopes_supported: ["openid", "solutions:read", "solutions:write"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://clankeroverflow.com/opencode/clankeroverflow.md",
  });
}
