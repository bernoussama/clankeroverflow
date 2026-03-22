# Guidelines

Always update this file with things you discover about the codebase and would be useful for future agents.

## Unified Layout and Design

For anything design-related, you MUST use the centralized design system in `apps/web/src/index.css`. This includes using the predefined CSS variables (e.g., `--landing-accent`, `--landing-surface`) and global utility classes (e.g., `.btn-primary`, `.landing-card`) to keep the design language unified in the whole app. Do not create one-off custom CSS or isolated styled-components.

## Codebase Notes

- `packages/auth/src/index.ts` uses GitHub-only Better Auth social login on the custom `/auth` base path; the server worker must receive `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` bindings, and the GitHub OAuth app callback must point at `${BETTER_AUTH_URL}/auth/callback/github` with `user:email` access enabled.
- `packages/auth/src/index.ts` also forces `account.storeStateStrategy = "cookie"`; Better Auth's default database-backed OAuth state verification can hang under local Miniflare during `/auth/callback/github`, while cookie-backed state returns normal OAuth errors and completes the flow.
- `packages/auth/src/index.ts` also needs `advanced.backgroundTasks.handler` wired to `c.executionCtx.waitUntil` from `apps/server/src/index.ts`; without that, Better Auth sign-in routes can hang under Cloudflare/Miniflare and surface as generic `Failed to fetch` / CORS noise even when the auth endpoint is the real source.
- `apps/web/src/app/dashboard/dashboard.tsx` manages API keys with a hand-written React Query key; keep load, `setQueryData`, and invalidation in sync, and do not rely on clipboard access alone because some incognito/locked-down browsers reject `navigator.clipboard.writeText`.
- API keys are hashed at rest: `packages/api/src/routers/apiKeys.ts` stores the SHA-256 hash in `schema.apiKey.key`, persists a masked `keyPreview`, and only returns the raw secret once from the create mutation for the dashboard's ephemeral reveal panel.
- `packages/api/src/routers/apiKeys.ts` should return the inserted API key row, including `createdAt`, so the dashboard can hydrate the list cache immediately after creation instead of waiting on a refetch.
- `packages/mcp-server/package.json` is published to npm for `npx`/OpenCode usage, so its runtime dependencies must stay concrete semver versions (no Bun `catalog:` entries) or npm/bunx installs fail before the MCP handshake.
- Running `npx @clankeroverflow/mcp-server` from the monorepo root is a misleading local smoke test: npm resolves the workspace package name to `clanker-mcp` without wiring that workspace bin onto `PATH`, so you get `sh: clanker-mcp: command not found` even though the published tarball/bin is valid. Verify the package from outside the repo (for example `/tmp`) or invoke the built binary directly.
- For local full-stack browser verification, running `bun run dev` from the repo root may fail to pass `DATABASE_URL` through Turbo into `@clankeroverflow/infra`; starting `packages/infra` directly with inline `DATABASE_URL=... bun run dev` works reliably.
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
