import { NextResponse } from "next/server";

import { env } from "@clankeroverflow/env/web";

import { getSiteUrlFromHeaders } from "@/lib/site-url";

export async function GET(request: Request) {
  const siteUrl = getSiteUrlFromHeaders(request.headers);
  const origin = siteUrl.replace(/\/$/, "");
  const apiBase = env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, "");

  const linkset = [
    {
      anchor: apiBase,
      "service-desc": [{ href: `${origin}/openapi.json`, type: "application/openapi+json" }],
      "service-doc": [{ href: `${origin}/docs/api`, type: "text/html" }],
      status: [{ href: `${apiBase}/health`, type: "text/plain" }],
    },
  ];

  return NextResponse.json(
    { linkset },
    {
      status: 200,
      headers: {
        "content-type": "application/linkset+json; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    },
  );
}
