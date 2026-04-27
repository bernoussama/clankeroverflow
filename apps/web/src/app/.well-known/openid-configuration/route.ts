import { AUTH_ISSUER } from "@/lib/agent-discovery";

export function GET() {
  return Response.json({
    issuer: AUTH_ISSUER,
    authorization_endpoint: `${AUTH_ISSUER}/sign-in/social`,
    token_endpoint: `${AUTH_ISSUER}/token`,
    jwks_uri: `${AUTH_ISSUER}/jwks`,
    grant_types_supported: ["authorization_code"],
    response_types_supported: ["code"],
    scopes_supported: ["openid", "email", "profile"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
  });
}
