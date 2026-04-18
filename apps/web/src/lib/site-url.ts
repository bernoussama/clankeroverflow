/**
 * Canonical public site URL for the web app (HTML origin).
 * Prefer proxy headers when present (e.g. Cloudflare / reverse proxies).
 */
export function getSiteUrlFromHeaders(headersList: Headers): string {
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  if (!host) {
    // Local dev fallback when Host is missing (SSR); production always sends Host / XFH.
    return "https://agent-discovery.invalid";
  }
  return `${proto}://${host}`;
}
