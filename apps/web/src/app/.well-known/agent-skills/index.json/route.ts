import { NextResponse } from "next/server";

import { AGENT_SKILLS_SCHEMA, SEARCH_SKILL_MD, sha256DigestHex } from "@/lib/agent-discovery";
import { getSiteUrlFromHeaders } from "@/lib/site-url";

export async function GET(request: Request) {
  const siteUrl = getSiteUrlFromHeaders(request.headers);
  const origin = siteUrl.replace(/\/$/, "");
  const skillUrl = `${origin}/.well-known/agent-skills/skills/search-solutions.md`;
  const digest = `sha256:${sha256DigestHex(SEARCH_SKILL_MD)}`;

  const body = {
    $schema: AGENT_SKILLS_SCHEMA,
    skills: [
      {
        name: "search-solutions",
        type: "skill-md",
        description: "Search and use the ClankerOverflow public knowledge base from agents.",
        url: skillUrl,
        digest,
      },
    ],
  };

  return NextResponse.json(body, {
    headers: {
      "cache-control": "public, max-age=3600",
    },
  });
}
