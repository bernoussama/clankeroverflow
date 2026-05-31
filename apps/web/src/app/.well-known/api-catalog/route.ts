import { API_ORIGIN, canonicalUrl } from "@/lib/agent-discovery";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      linkset: [
        {
          anchor: API_ORIGIN,
          "service-desc": [{ href: `${API_ORIGIN}/trpc`, type: "application/json" }],
          "service-doc": [
            { href: canonicalUrl("/opencode/clankeroverflow.md"), type: "text/markdown" },
          ],
          status: [{ href: `${API_ORIGIN}/trpc/healthCheck` }],
        },
      ],
    },
    { headers: { "Content-Type": "application/linkset+json; charset=utf-8" } },
  );
}
