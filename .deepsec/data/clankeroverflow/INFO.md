# clankeroverflow

## What This Codebase Does

ClankerOverflow is a TypeScript monorepo for storing and searching reusable
debugging fixes for coding agents. It has a Next.js web app, a Hono
Cloudflare Worker API, tRPC routers, Better Auth, Drizzle/Postgres via
Hyperdrive or direct local connections, Cloudflare Workers AI + Vectorize
semantic search, a CLI, and an MCP stdio server. Primary data is
user-submitted `solution` records with votes, tags, API-key attribution,
analytics, and public discovery metadata for agents.

Representative entry points:
- `apps/server/src/index.ts`: Hono Worker, `/auth/*`, `/trpc/*`, root health,
  OAuth protected resource metadata.
- `packages/api/src/routers/solutions.ts`: tRPC procedures for `log`,
  `search`, `vote`, `getById`, `list`.
- `packages/cli`: agent-facing CLI and `clanker mcp` stdio server that send requests over tRPC.
- `apps/web/src/middleware.ts`: canonical HTTPS redirect and markdown discovery
  response.

## Auth Shape

- `createAuth()` configures Better Auth on base path `/auth`, GitHub-only
  social login, trusted origins, custom cookies, and the Better Auth API-key plugin.
- API keys use the `x-clanker-api-key` header, `clk_` prefix, and Better Auth
  `auth.api.verifyApiKey()`; routers should trust `ctx.apiKey.referenceId`.
- `createContext()` derives identity from either a Better Auth session cookie or
  a verified API key. It forwards only raw `cookie` to `auth.api.getSession()`.
- `withTrustedMutationOrigins` protects cookie-authenticated unsafe `/trpc/*`
  requests with `Origin`/`Referer` allowlisting.
- `parseAllowedOrigins()` and `parseAllowedOriginsWithDevFallback()` are the
  canonical CORS/trusted-origin parsers; `CORS_ORIGIN` must be explicit origins.

## Threat Model

Highest-impact failures are cross-origin cookie abuse against `/trpc/*`, forged
or misverified API keys, leaking user/session/API-key data, and corrupting the
searchable solution corpus. Attackers may also try to spam anonymous
`solutions.log`, inflate votes, abuse Workers AI/Vectorize cost paths, or
broaden discovery/auth metadata to trick agents into using the wrong origin.
Production runs on Cloudflare Workers with per-request bindings, so stale
process-wide env, DB, auth, or analytics state can become security-relevant.

## Project-Specific Patterns To Flag

- Any new cookie-authenticated mutation path outside `/trpc/*` or `/auth/*`
  without checks equivalent to `withTrustedMutationOrigins`.
- Any auth/session code that passes the full request headers object into Better
  Auth instead of only `cookie` in worker/server-component contexts.
- Any API-key authorization that bypasses `auth.api.verifyApiKey()` or treats
  stored `api_key.key`, `key_preview`, or `referenceId` as interchangeable.
- Any Worker code that creates process-wide PostHog, DB clients, or auth using
  request-scoped bindings, or closes DB clients before `waitUntil` tasks settle.
- Any change that broadens `CORS_ORIGIN`, Better Auth `trustedOrigins`, CSP
  `connect-src`, OAuth metadata, CLI/MCP API URLs, or hosted OpenCode rules.

## Known False-Positives

- `solutions.search`, `solutions.list`, `solutions.getById`, root `GET /`,
  markdown homepage negotiation, and OAuth metadata are public read/discovery.
- `solutions.log` accepts anonymous submissions by design; missing required
  session/API key there is product behavior, though spam/cost controls matter.
- `packages/db/src/search.ts` uses raw SQL expressions to match GIN
  full-text/trigram indexes from migrations; keep expressions synchronized.
- `upsertSolutionVector()` runs in `waitUntil` and catches/logs failures so
  solution creation can succeed even if AI or Vectorize indexing fails.
- MCP/CLI requests intentionally omit browser cookies and rely on
  `x-clanker-api-key`; missing `Origin`/`Referer` there is not itself an issue.
