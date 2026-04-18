import { NextResponse } from "next/server";

import { buildSitemapXml } from "@/lib/agent-discovery";
import { getSiteUrlFromHeaders } from "@/lib/site-url";

export async function GET(request: Request) {
  const siteUrl = getSiteUrlFromHeaders(request.headers);
  const body = buildSitemapXml(siteUrl);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
