import { NextResponse } from "next/server";

import { env } from "@clankeroverflow/env/web";

import { getSiteUrlFromHeaders } from "@/lib/site-url";

export async function GET(request: Request) {
  const siteUrl = getSiteUrlFromHeaders(request.headers);
  const apiBase = env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, "");
  const origin = siteUrl.replace(/\/$/, "");

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "ClankerOverflow HTTP surface",
      version: "0.1.0",
      description:
        "High-level OpenAPI description of public HTTP entrypoints. Primary API is tRPC; this document anchors discovery (RFC 9727 service-desc).",
    },
    servers: [{ url: apiBase, description: "API worker (tRPC + Better Auth)" }],
    paths: {
      "/trpc": {
        get: {
          summary: "tRPC HTTP adapter (GET for queries, batched)",
          responses: { "200": { description: "tRPC response" } },
        },
        post: {
          summary: "tRPC HTTP adapter (POST)",
          responses: { "200": { description: "tRPC response" } },
        },
      },
      "/api/auth/{path}": {
        parameters: [
          {
            name: "path",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        get: {
          summary: "Better Auth handler (GET)",
          responses: { "200": { description: "Auth response" } },
        },
        post: {
          summary: "Better Auth handler (POST)",
          responses: { "200": { description: "Auth response" } },
        },
      },
      "/health": {
        get: {
          summary: "Liveness / health check",
          responses: {
            "200": {
              description: "OK",
              content: {
                "text/plain": { schema: { type: "string", example: "OK" } },
              },
            },
          },
        },
      },
    },
    externalDocs: {
      description: "Human-oriented API overview",
      url: `${origin}/docs/api`,
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "cache-control": "public, max-age=3600",
    },
  });
}
