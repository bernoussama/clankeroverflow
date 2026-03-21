import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

describe("next config security headers", () => {
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
  });
});
