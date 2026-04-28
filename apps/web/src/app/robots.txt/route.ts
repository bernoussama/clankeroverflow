import { canonicalUrl, textResponse } from "@/lib/agent-discovery";

const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "Claude-Web", "Google-Extended"] as const;

function rulesFor(userAgent: string) {
  return [`User-agent: ${userAgent}`, "Allow: /", "Allow: /solutions", "Allow: /solution/", "Allow: /opencode/", "Allow: /.well-known/", "Disallow: /dashboard", "Disallow: /onboarding", "Disallow: /login", "Disallow: /api/", "Disallow: /trpc/", "Content-Signal: ai-train=no, search=yes, ai-input=no"].join("\n");
}

export function GET() {
  const body = [
    rulesFor("*"),
    ...AI_CRAWLERS.map(rulesFor),
    `Sitemap: ${canonicalUrl("/sitemap.xml")}`,
  ].join("\n\n");

  return textResponse(`${body}\n`, "text/plain; charset=utf-8");
}
