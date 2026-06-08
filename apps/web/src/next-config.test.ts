import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const staticHeadersSource = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");

describe("next config", () => {
  it("inlines production CSS to remove the render-blocking stylesheet waterfall", () => {
    expect(nextConfigSource).toContain("inlineCss: true");
  });

  it("defines global hardening headers for app routes", () => {
    expect(nextConfigSource).toContain("async headers()");
    expect(nextConfigSource).toContain("Content-Security-Policy");
    expect(nextConfigSource).toContain("Cross-Origin-Opener-Policy");
    expect(nextConfigSource).toContain("Cross-Origin-Resource-Policy");
    expect(nextConfigSource).toContain("Origin-Agent-Cluster");
    expect(nextConfigSource).toContain("X-Frame-Options");
    expect(nextConfigSource).toContain("X-DNS-Prefetch-Control");
    expect(nextConfigSource).toContain("Referrer-Policy");
    expect(nextConfigSource).toContain("Permissions-Policy");
    expect(nextConfigSource).toContain("Strict-Transport-Security");
    expect(nextConfigSource).toContain("frame-ancestors 'none'");
    expect(nextConfigSource).toContain("object-src 'none'");
    expect(nextConfigSource).not.toContain("browsing-topics=()");
    expect(nextConfigSource).toContain("https://static.cloudflareinsights.com");
    expect(nextConfigSource).toContain("https://cloudflareinsights.com");
    expect(nextConfigSource).toContain("https://eu-assets.i.posthog.com");
    expect(nextConfigSource).toContain("https://eu.i.posthog.com");
    expect(nextConfigSource).toContain("NEXT_PUBLIC_POSTHOG_HOST");
    expect(nextConfigSource).toContain('".i.posthog.com"');
    expect(nextConfigSource).toContain("configuredPostHogScriptSource");
  });

  it("defines hardening and cache headers for direct static asset responses", () => {
    expect(staticHeadersSource).toContain("/*");
    expect(staticHeadersSource).toContain("Cross-Origin-Resource-Policy: same-site");
    expect(staticHeadersSource).toContain("Referrer-Policy: strict-origin-when-cross-origin");
    expect(staticHeadersSource).toContain("Strict-Transport-Security:");
    expect(staticHeadersSource).toContain("X-Content-Type-Options: nosniff");
    expect(staticHeadersSource).toContain("/_next/static/*");
    expect(staticHeadersSource).toContain("/agent-logos/*");
    expect(staticHeadersSource).toContain("/clankeroverflow-homepage.webp");
    expect(nextConfigSource).toContain("/agent-logos/:path*");
    expect(nextConfigSource).toContain("/clankeroverflow-homepage.webp");
    expect(staticHeadersSource).toContain("Cache-Control: public, max-age=31556952, immutable");
  });
});
