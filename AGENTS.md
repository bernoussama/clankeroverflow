# Guidelines

Always update this file with things you discover about the codebase and would be useful for future agents.

## Unified Layout and Design

For anything design-related, you MUST use the centralized design system in `apps/web/src/index.css`. This includes using the predefined CSS variables (e.g., `--landing-accent`, `--landing-surface`) and global utility classes (e.g., `.btn-primary`, `.landing-card`) to keep the design language unified in the whole app. Do not create one-off custom CSS or isolated styled-components.

## Codebase Notes

- `packages/auth/src/index.ts` uses GitHub-only Better Auth social login on the custom `/auth` base path; the server worker must receive `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` bindings, and the GitHub OAuth app callback must point at `${BETTER_AUTH_URL}/auth/callback/github` with `user:email` access enabled.
- `packages/auth/src/index.ts` also forces `account.storeStateStrategy = "cookie"`; Better Auth's default database-backed OAuth state verification can hang under local Miniflare during `/auth/callback/github`, while cookie-backed state returns normal OAuth errors and completes the flow.
- `packages/auth/src/index.ts` also needs `advanced.backgroundTasks.handler` wired to `c.executionCtx.waitUntil` from `apps/server/src/index.ts`; without that, Better Auth sign-in routes can hang under Cloudflare/Miniflare and surface as generic `Failed to fetch` / CORS noise even when the auth endpoint is the real source.
- `packages/auth/src/index.ts` now owns API keys through Better Auth's plugin instead of a custom tRPC router: it uses the `x-clanker-api-key` header, the `clk_` prefix, required names, stored starting characters (`charactersLength: 8`), and no default expiration or built-in rate limiting.
- The Better Auth API key plugin expects the Drizzle model name `apikey`; `packages/db/src/schema/api-keys.ts` exports `schema.apikey` but maps it onto the existing physical `api_key` table by using `referenceId -> user_id` and `start -> key_preview`.
- `packages/db/src/migrations/0004_better_auth_api_keys.sql` intentionally deletes all existing rows in `api_key` before adding the Better Auth plugin columns, so old custom-issued keys are revoked during the cutover.
- `apps/web/src/app/dashboard/dashboard.tsx` manages API keys with a hand-written React Query key; keep load, `setQueryData`, and invalidation in sync, and do not rely on clipboard access alone because some incognito/locked-down browsers reject `navigator.clipboard.writeText`.
- `apps/web/src/app/dashboard/dashboard.tsx` and `apps/web/src/app/onboarding/onboarding.tsx` now call `authClient.apiKey.list/create/delete` directly; do not reintroduce tRPC API key CRUD unless the Better Auth flow is intentionally being replaced.
- `apps/web/src/lib/auth-client.ts` must point Better Auth React client calls at `${NEXT_PUBLIC_SERVER_URL}/auth` and use `apiKeyClient()` from `@better-auth/api-key/client`, not the server-side plugin import.
- `apps/web/src/lib/auth-client.ts` sets `fetchOptions.throw = true`; UI callers like `authClient.signIn.social()` must handle failures with `try/catch` instead of expecting an `{ error }` field in the return value, or TypeScript will break production builds.
- `packages/api/src/context.ts` verifies `x-clanker-api-key` via `auth.api.verifyApiKey()` and routers should trust `ctx.apiKey.referenceId`; do not hash the header and query `api_key` manually in routers anymore.
- `packages/mcp-server/package.json` is published to npm for `npx`/OpenCode usage, so its runtime dependencies must stay concrete semver versions (no Bun `catalog:` entries) or npm/bunx installs fail before the MCP handshake.
- Running `npx @clankeroverflow/mcp-server` from the monorepo root is a misleading local smoke test: npm resolves the workspace package name to `clanker-mcp` without wiring that workspace bin onto `PATH`, so you get `sh: clanker-mcp: command not found` even though the published tarball/bin is valid. Verify the package from outside the repo (for example `/tmp`) or invoke the built binary directly.
- For local full-stack browser verification, running `bun run dev` from the repo root may fail to pass `DATABASE_URL` through Turbo into `@clankeroverflow/infra`; starting `packages/infra` directly with inline `DATABASE_URL=... bun run dev` works reliably.
- Root `bun run dev` now wraps `turbo dev --filter=web --filter=server` via `scripts/dev-with-postgres.ts`: it runs `docker compose up -d --wait` before starting the workspace dev processes, forwards `SIGINT`/`SIGTERM` to the child dev command, and always runs `docker compose down` on exit. Use `bun run dev:bare` for the same web+server dev flow without Docker management, and `bun run dev:all` only when you intentionally want the full Turbo graph (including `@clankeroverflow/infra#dev`, which can collide with `web#dev` on port `3001`).
- Root `bun run dev` also runs `bun run db:push` after Docker Postgres is ready and before `web`/`server` boot, because local databases have historically been initialized without Drizzle's migration journal; `db:push` keeps legacy local DBs in sync and prevents Better Auth plugin schema mismatches like missing `api_key.config_id` / `api_key.expires_at` columns during onboarding API key creation. `bun run dev:bare` and split `apps/server` + `apps/web` dev still require a manual `bun run db:push` first.
- Cloud agent / no-Docker environments: install PostgreSQL locally (e.g. Ubuntu `postgresql` package), run `sudo pg_ctlcluster 16 main start`, ensure database `clankeroverflow` and user `postgres` exist with a known password, set `DATABASE_URL=postgres://postgres:postgres@localhost:5432/clankeroverflow` in `apps/server/.env` (used by `drizzle-kit`). Integration coverage: `cd packages/auth && bun test src/github-auth.integration.test.ts` (preloads `apps/server/test-setup.ts` for Cloudflare env mocks) migrates `packages/db/src/migrations` and checks `createAuth(db)` plus a GitHub-shaped `account` row against live Postgres.
- Local GitHub OAuth without Alchemy: `cd apps/server && bun run dev` runs `wrangler dev` (see `apps/server/wrangler.toml`, `compatibility_date` required for `pg`); copy required secrets into `apps/server/.dev.vars` (gitignored) from `apps/server/.env`. Run Next on port 3001 via `cd apps/web && bun run dev`. Open the web app with the **`localhost` hostname** (same host the server CORS allowlist uses); the numeric loopback host is a different browser origin unless you add it to the comma-separated allowlist in server env. For plain `http` API URLs on loopback, Better Auth uses lax/non-secure session cookies (see `getDefaultCookieAttributes` in `packages/auth/src/index.ts`); production HTTPS still uses `SameSite=None` + `Secure`.
- `packages/db/src/index.ts` must treat a local `process.env.DATABASE_URL` fallback like a request-scoped worker connection in `wrangler dev`; if the worker falls back to the shared `pg.Pool` path, Better Auth session routes such as `/auth/get-session` and `/auth/callback/github` can hang or time out while trying to connect to Postgres.
- `packages/db/src/index.ts` must also treat direct Worker `DATABASE_URL` bindings as `worker` runtime connections inside `createDb()`; local `wrangler dev` / Alchemy server bindings can inject `DATABASE_URL` without `HYPERDRIVE`, and classifying that path as pooled reproduces the Better Auth GitHub callback/session hang.
- `apps/server/src/index.ts` must keep request-scoped DB clients alive until any Better Auth `waitUntil` background tasks settle; closing the client immediately after `/auth/get-session` returns can break session refresh/update work and surface as worker hangs or 500s on server-rendered pages like `/dashboard` or `/onboarding`.
- `alchemy dev` can fail with `Unsupported state or unable to authenticate data` when decrypting prior local Alchemy state; use Wrangler + Next dev above or clear `.alchemy` state if you need a clean Alchemy run.
- `alchemy deploy` preloads `packages/infra/.env` before `alchemy.run.ts`, so deploy code must clear any shadowed local `DATABASE_URL` values before loading `packages/infra/.env.production`; otherwise Hyperdrive can be updated with `localhost` and Cloudflare rejects it as non-public.
- `apps/web/.env` points `NEXT_PUBLIC_SERVER_URL` at `http://localhost:3000`; if you open the Next app on `http://localhost:3001` without the full proxy setup, dashboard auth/session and tRPC calls can fail with CORS or server-component errors, so verify `/dashboard` through the unified full-stack dev setup when possible.
- In local split-origin dev (`web` on `http://localhost:3001`, auth server on `http://localhost:3000`), Better Auth social sign-in callback URLs must be absolute web URLs (for example `${window.location.origin}/dashboard`) rather than `/dashboard`, or OAuth completes on the API origin and lands on `http://localhost:3000/dashboard`.
- `apps/web/src/app/dashboard/page.tsx` should forward only the incoming `cookie` header to `authClient.getSession()` in server components; passing the full `headers()` object to the auth server can hang local Miniflare on `/auth/get-session` after sign-in.
- `packages/api/src/context.ts` should also forward only the raw `cookie` header into `auth.api.getSession()`; passing the full request headers can make authenticated local tRPC calls hang or 500 under Miniflare after sign-in.
- Production app-to-API traffic uses `https://api.clankeroverflow.com` (`packages/infra/.env.production`); keep CLI defaults, MCP defaults, and dashboard setup examples aligned with that domain unless the user explicitly wants a custom/self-hosted server.
- Deploying `packages/infra` does not apply Drizzle schema changes to Neon; run the `packages/db` migration workflow separately for production schema updates or new dashboard queries can 500 against stale columns.
- `CORS_ORIGIN` is shared by the server CORS middleware and Better Auth trusted origins; keep it as a comma-separated list when multiple web hostnames (for example apex + `www`) need the same session/auth access to `api.clankeroverflow.com`.
- `packages/auth/src/origins.ts` now validates `CORS_ORIGIN` entries as bare `http`/`https` origins and normalizes trailing slashes, so env values with paths, hashes, credentials, or duplicate slash variants fail fast at startup.
- Response hardening headers live in both `apps/server/src/index.ts` and `apps/web/next.config.ts`; if you add new app origins or browser capabilities, update both places together so API and Next responses stay aligned.
- `apps/server/src/index.ts` rejects cookie-authenticated unsafe `/trpc/*` requests unless their `Origin` or `Referer` matches `CORS_ORIGIN`; leave API key clients exempt so CLI/MCP mutations still work without browser headers.
- `apps/server/src/index.ts` marks `/api/auth/*` and `/trpc/*` responses as `Cache-Control: no-store` / `Pragma: no-cache`, so do not expect browser or intermediary caching for auth or RPC traffic.
- `apps/web/next.config.ts` derives CSP `connect-src` from `NEXT_PUBLIC_SERVER_URL`; keep extra `localhost` / websocket sources limited to development so production does not silently broaden outbound connections.
- OpenCode MCP setup uses `opencode.json` with `mcp.{name}.type = "local"`, a `command` array, and `environment`; do not reuse Claude Desktop's `mcpServers` / `args` / `env` shape in OpenCode-facing docs.
- `/solutions` infinite scrolling uses a composite cursor from `packages/db/src/list.ts`; keep `{ score, createdAt, id }` aligned with `packages/api/src/routers/solutions.ts` input validation and `apps/web/src/utils/trpc-output-types.ts` parsing so both recent and top sorting stay deterministic.
- Cloudflare Hyperdrive does not support the SQL `DEFAULT` keyword in `INSERT ... VALUES` clauses; always pass explicit values (e.g. `createdAt: new Date()`) in Drizzle `.values()` calls instead of relying on `.defaultNow()` column defaults, or inserts will 500 in production.
- `packages/db/src/index.test.ts` and `packages/auth/src/github-auth.integration.test.ts` create throwaway PostgreSQL databases per run before migrating; use that pattern for migration-backed tests so reruns do not fail on already-created shared tables.

## Code style

- Write idiomatic, simple, maintainable code. Always ask yourself if this is the most simple intuitive solution to the problem. Always KISS (Keep It Simple Stupid). DRY. YAGNI. TDD. Frequent commits.
- Instead of applying a bandaid, fix things from first principles, find the source and fix it versus applying a cheap bandaid on top.
- Before adding any dependency: Research well-maintained options and confirm fit with the user before adding.
- For Web Projects, Always use agent-browser skill to test changes/features.

## ENTROPY REMINDER

This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Tests Rules

### Test Enforcement

- Every change must be programmatically tested. Write a new test or update an existing test, then run the affected tests to make sure they pass.
- Run the minimum number of tests needed to ensure code quality and speed.
- Failing tests are acceptable when they expose genuine bugs and test correct behavior

## Specialized Subagents

- Oracle
  Invoke for: code review, architecture decisions, debugging analysis, refactor planning, second opinion.

- Librarian
  Invoke for: understanding 3rd party libraries/packages, exploring remote repositories, discovering open source patterns.

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED

Any shell command containing `curl` or `wget` will be intercepted and blocked by the context-mode plugin. Do NOT retry.
Instead use:

- `context-mode_ctx_fetch_and_index(url, source)` to fetch and index web pages
- `context-mode_ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED

Any shell command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` will be intercepted and blocked. Do NOT retry with shell.
Instead use:

- `context-mode_ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### Direct web fetching — BLOCKED

Do NOT use any direct URL fetching tool. Use the sandbox equivalent.
Instead use:

- `context-mode_ctx_fetch_and_index(url, source)` then `context-mode_ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Shell (>20 lines output)

Shell is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:

- `context-mode_ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `context-mode_ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### File reading (for analysis)

If you are reading a file to **edit** it → reading is correct (edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `context-mode_ctx_execute_file(path, language, code)` instead. Only your printed summary enters context.

### grep / search (large results)

Search results can flood context. Use `context-mode_ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `context-mode_ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `context-mode_ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `context-mode_ctx_execute(language, code)` | `context-mode_ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `context-mode_ctx_fetch_and_index(url, source)` then `context-mode_ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `context-mode_ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `search(source: "label")` later.

## ctx commands

| Command       | Action                                                                            |
| ------------- | --------------------------------------------------------------------------------- |
| `ctx stats`   | Call the `stats` MCP tool and display the full output verbatim                    |
| `ctx doctor`  | Call the `doctor` MCP tool, run the returned shell command, display as checklist  |
| `ctx upgrade` | Call the `upgrade` MCP tool, run the returned shell command, display as checklist |
