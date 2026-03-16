## Cursor Cloud specific instructions

### Project Overview
ClankerOverflow is a knowledge base for AI coding agents — a Turborepo monorepo with a Next.js 16 web frontend (`apps/web`, port 3001), a Hono API server running as a Cloudflare Worker (`apps/server`, port 3000), and shared packages (`packages/api`, `packages/auth`, `packages/db`, `packages/env`, `packages/cli`).

### Running services in dev mode

The canonical `bun run dev` uses Alchemy (`packages/infra`) to orchestrate both services and provision a local D1 database. **However, Alchemy requires Cloudflare credentials** (`CLOUDFLARE_API_TOKEN` or `alchemy login`) even in dev mode for Nextjs/Worker resource creation. Without them, D1 and Next.js start but the scope fails before the Worker (server) starts.

**Workaround — run services independently:**

1. **Server** (Hono on Cloudflare Worker via Wrangler):
   ```bash
   cd apps/server
   # Create wrangler.toml if not present (see below), then:
   npx wrangler d1 migrations apply clankeroverflow-database-dev --local --config wrangler.toml
   npx wrangler dev --port 3000 --config wrangler.toml
   ```
   A `wrangler.toml` must exist in `apps/server/` with: `main = "src/index.ts"`, `compatibility_flags = ["nodejs_compat"]`, vars for `CORS_ORIGIN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (localhost values), and a `[[d1_databases]]` block with `binding = "DB"` and `migrations_dir = "../../packages/db/src/migrations"`.

2. **Web** (Next.js):
   ```bash
   cd apps/web
   NEXT_PUBLIC_SERVER_URL=$BETTER_AUTH_URL npx next dev --port 3001
   ```

### Environment variables

Create `.env` files in `packages/infra/`, `apps/server/`, and `apps/web/` with these variables:
- `BETTER_AUTH_SECRET` — any random string for local dev
- `BETTER_AUTH_URL` — server URL (server port, typically 3000)
- `CORS_ORIGIN` — web URL (web port, typically 3001)
- `NEXT_PUBLIC_SERVER_URL` — same as BETTER_AUTH_URL

For Alchemy dev (`bun run dev`), also set `ALCHEMY_PASSWORD` in `packages/infra/.env`.

### Lint, test, and type-check

- **Lint + format**: `bun run check` (oxlint + oxfmt)
- **Unit tests**: `bun test` in `packages/api`, `packages/cli`, or `apps/server` (all use bun:test)
- **Type check**: `bun run check-types` — note: pre-existing `bun:test` type resolution errors in CLI and server test files
- **E2E tests**: `bun run test:e2e` in `apps/web` (Playwright, requires running dev servers)

### Gotchas

- The `dev:bare` script in `apps/web` uses `--port 3000` which conflicts with the server; use `npx next dev --port 3001` instead.
- The server uses `cloudflare:workers` for env bindings, so it **must** run under Wrangler (not plain `bun run`).
- D1 local state for wrangler is stored in `apps/server/.wrangler/state/v3/d1/`. For Alchemy, it's in `.alchemy/miniflare/v3/d1/`.
- Alchemy state files (`packages/infra/.alchemy/`) should be cleaned (`rm -rf .alchemy packages/infra/.alchemy`) if Alchemy fails mid-run.
