import { NextResponse } from "next/server";

import { buildRobotsTxt } from "@/lib/agent-discovery";
import { getSiteUrlFromHeaders } from "@/lib/site-url";

export async function GET(request: Request) {
  const siteUrl = getSiteUrlFromHeaders(request.headers);
  const body = buildRobotsTxt(siteUrl);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
