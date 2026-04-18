import { NextResponse } from "next/server";

import { env } from "@clankeroverflow/env/web";

import { getSiteUrlFromHeaders } from "@/lib/site-url";

export async function GET(request: Request) {
  const siteUrl = getSiteUrlFromHeaders(request.headers);
  const apiBase = env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, "");
  const issuer = apiBase;

  const body = {
    issuer,
    authorization_endpoint: `${siteUrl.replace(/\/$/, "")}/login`,
    token_endpoint: `${issuer}/api/auth/sign-in/email`,
    jwks_uri: `${issuer}/jwks`,
    grant_types_supported: ["password"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    response_types_supported: ["none"],
  };

  return NextResponse.json(body, {
    headers: {
      "cache-control": "public, max-age=3600",
    },
  });
}
