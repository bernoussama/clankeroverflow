import { env } from "@clankeroverflow/env/web";
import type { NextConfig } from "next";

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const isDev = process.env.NODE_ENV !== "production";
const serverOrigin = new URL(env.NEXT_PUBLIC_SERVER_URL).origin;
const analyticsConnectSource = "https://cloudflareinsights.com";
const analyticsScriptSource = "https://static.cloudflareinsights.com";
const postHogConnectSource = "https://eu.i.posthog.com";
const postHogScriptSource = "https://eu-assets.i.posthog.com";
const connectSources = isDev
  ? ["'self'", serverOrigin, "http://localhost:*", "ws://localhost:*", "ws:", "wss:"]
  : ["'self'", serverOrigin, analyticsConnectSource, postHogConnectSource];
const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : [analyticsScriptSource, postHogScriptSource]),
];

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data: https:",
  `connect-src ${connectSources.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-site",
  },
  {
    key: "Origin-Agent-Cluster",
    value: "?1",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
] as const;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [...securityHeaders],
      },
    ];
  },
  typedRoutes: true,
  reactCompiler: true,
};

export default nextConfig;

initOpenNextCloudflareForDev();
