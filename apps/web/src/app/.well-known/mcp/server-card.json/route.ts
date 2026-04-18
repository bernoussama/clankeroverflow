import { NextResponse } from "next/server";

import { env } from "@clankeroverflow/env/web";

export async function GET() {
  const apiBase = env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, "");

  const body = {
    serverInfo: {
      name: "clankeroverflow",
      version: "0.1.0",
    },
    endpoint: `${apiBase}/mcp`,
    capabilities: {
      tools: false,
      resources: false,
      prompts: false,
    },
  };

  return NextResponse.json(body, {
    headers: {
      "cache-control": "public, max-age=3600",
    },
  });
}
