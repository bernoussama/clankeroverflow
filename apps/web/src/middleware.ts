import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const LINK_HEADER =
  '</.well-known/api-catalog>; rel="api-catalog", ' +
  '</openapi.json>; rel="service-desc"; type="application/openapi+json", ' +
  '</docs/api>; rel="service-doc", ' +
  '</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json", ' +
  '</sitemap.xml>; rel="sitemap"; type="application/xml"';

function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const parts = accept.split(",").map((p) => p.trim().split(";")[0]?.toLowerCase() ?? "");
  return parts.some((m) => m === "text/markdown" || m === "text/x-markdown");
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") {
    return NextResponse.next();
  }

  if (prefersMarkdown(request.headers.get("accept"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/.internal/markdown-home";
    const res = NextResponse.rewrite(url);
    res.headers.set("Link", LINK_HEADER);
    return res;
  }

  const res = NextResponse.next();
  res.headers.set("Link", LINK_HEADER);
  return res;
}

export const config = {
  matcher: ["/"],
};
