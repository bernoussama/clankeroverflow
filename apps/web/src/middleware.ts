import { NextResponse, type NextRequest } from "next/server";

import { DISCOVERY_LINK_HEADER, HOME_MARKDOWN, SITE_ORIGIN } from "@/lib/agent-discovery";

const canonicalHostname = new URL(SITE_ORIGIN).hostname;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|login(?:/|$)|cli-auth(?:/|$)).*)"],
};

export function middleware(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isCanonicalHost = request.nextUrl.hostname === canonicalHostname;
  const isHttp = forwardedProto === "http" || request.nextUrl.protocol === "http:";

  if (isCanonicalHost && isHttp) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 301);
  }

  if (
    request.nextUrl.pathname === "/" &&
    request.headers.get("accept")?.includes("text/markdown")
  ) {
    return new Response(HOME_MARKDOWN, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "text/markdown; charset=utf-8",
        Link: DISCOVERY_LINK_HEADER,
        Vary: "Accept",
        "x-markdown-tokens": String(HOME_MARKDOWN.split(/\s+/).filter(Boolean).length),
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("Link", DISCOVERY_LINK_HEADER);
  response.headers.set("Vary", "Accept");
  return response;
}
