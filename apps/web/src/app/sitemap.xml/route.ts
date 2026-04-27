import { canonicalUrl, PUBLIC_ROUTES, textResponse } from "@/lib/agent-discovery";

export function GET() {
  const urls = PUBLIC_ROUTES.map(
    (path) => `  <url>\n    <loc>${canonicalUrl(path)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${path === "/" ? "1.0" : "0.7"}</priority>\n  </url>`,
  ).join("\n");
  return textResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, "application/xml; charset=utf-8");
}
