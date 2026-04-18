import { NextResponse } from "next/server";

import { env } from "@clankeroverflow/env/web";

export async function GET() {
  const apiBase = env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, "");
  const resource = `${apiBase}/trpc`;

  const body = {
    resource,
    authorization_servers: [apiBase],
    scopes_supported: ["trpc"],
  };

  return NextResponse.json(body, {
    headers: {
      "cache-control": "public, max-age=3600",
    },
  });
}
