import { NextResponse } from "next/server";

import { env } from "@clankeroverflow/env/web";

import { buildHomeMarkdown, markdownTokenCount } from "@/lib/agent-discovery";
import { getSiteUrlFromHeaders } from "@/lib/site-url";

const LINK_HEADER =
  '</.well-known/api-catalog>; rel="api-catalog", ' +
  '</openapi.json>; rel="service-desc"; type="application/openapi+json", ' +
  '</docs/api>; rel="service-doc", ' +
  '</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", ' +
  '</sitemap.xml>; rel="sitemap"; type="application/xml"';

export async function GET(request: Request) {
  const siteUrl = getSiteUrlFromHeaders(request.headers);
  const md = buildHomeMarkdown(siteUrl, env.NEXT_PUBLIC_SERVER_URL);
  const tokens = markdownTokenCount(md);

  return new NextResponse(md, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "x-markdown-tokens": String(tokens),
      link: LINK_HEADER,
      "cache-control": "public, max-age=60",
    },
  });
}
