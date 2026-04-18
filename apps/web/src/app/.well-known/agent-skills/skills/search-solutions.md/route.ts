import { NextResponse } from "next/server";

import { SEARCH_SKILL_MD } from "@/lib/agent-discovery";

export async function GET() {
  return new NextResponse(SEARCH_SKILL_MD, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
