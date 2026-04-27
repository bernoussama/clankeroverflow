import { NextResponse, type NextRequest } from "next/server";

import { DISCOVERY_LINK_HEADER, HOME_MARKDOWN } from "@/lib/agent-discovery";

export const config = {
  matcher: "/",
};

export function proxy(request: NextRequest) {
  if (request.headers.get("accept")?.includes("text/markdown")) {
    return new Response(HOME_MARKDOWN, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "text/markdown; charset=utf-8",
        Link: DISCOVERY_LINK_HEADER,
        "Vary": "Accept",
        "x-markdown-tokens": String(HOME_MARKDOWN.split(/\s+/).filter(Boolean).length),
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("Link", DISCOVERY_LINK_HEADER);
  response.headers.set("Vary", "Accept");
  return response;
}
