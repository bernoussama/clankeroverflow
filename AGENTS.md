# Guidelines

Always update this file with things you discover about the codebase and would be useful for future agents.

## Unified Layout and Design
For anything design-related, you MUST use the centralized design system in `apps/web/src/index.css`. This includes using the predefined CSS variables (e.g., `--landing-accent`, `--landing-surface`) and global utility classes (e.g., `.btn-primary`, `.landing-card`) to keep the design language unified in the whole app. Do not create one-off custom CSS or isolated styled-components.

## Codebase Notes
- `packages/auth/src/index.ts` runs Better Auth inside a Cloudflare Worker; the default Better Auth scrypt path can exceed Worker CPU limits on email/password POST routes, so keep the custom native `node:crypto.scrypt` helpers in `packages/auth/src/password.ts` wired into `emailAndPassword.password`.
- `apps/web/src/app/dashboard/dashboard.tsx` manages API keys with a hand-written React Query key; keep load, `setQueryData`, and invalidation in sync, and do not rely on clipboard access alone because some incognito/locked-down browsers reject `navigator.clipboard.writeText`.
- `packages/api/src/routers/apiKeys.ts` should return the inserted API key row, including `createdAt`, so the dashboard can hydrate the list cache immediately after creation instead of waiting on a refetch.
- `packages/mcp-server/package.json` is published to npm for `npx`/OpenCode usage, so its runtime dependencies must stay concrete semver versions (no Bun `catalog:` entries) or npm/bunx installs fail before the MCP handshake.
- Running `npx @clankeroverflow/mcp-server` from the monorepo root is a misleading local smoke test: npm resolves the workspace package name to `clanker-mcp` without wiring that workspace bin onto `PATH`, so you get `sh: clanker-mcp: command not found` even though the published tarball/bin is valid. Verify the package from outside the repo (for example `/tmp`) or invoke the built binary directly.
- For local full-stack browser verification, running `bun run dev` from the repo root may fail to pass `DATABASE_URL` through Turbo into `@clankeroverflow/infra`; starting `packages/infra` directly with inline `DATABASE_URL=... bun run dev` works reliably.
- `apps/web/.env` points `NEXT_PUBLIC_SERVER_URL` at `http://localhost:3000`; if you open the Next app on `http://localhost:3001` without the full proxy setup, dashboard auth/session and tRPC calls can fail with CORS or server-component errors, so verify `/dashboard` through the unified full-stack dev setup when possible.
- Production app-to-API traffic uses `https://api.clankeroverflow.com` (`packages/infra/.env.production`); keep CLI defaults, MCP defaults, and dashboard setup examples aligned with that domain unless the user explicitly wants a custom/self-hosted server.
- `CORS_ORIGIN` is shared by the server CORS middleware and Better Auth trusted origins; keep it as a comma-separated list when multiple web hostnames (for example apex + `www`) need the same session/auth access to `api.clankeroverflow.com`.
- OpenCode MCP setup uses `opencode.json` with `mcp.{name}.type = "local"`, a `command` array, and `environment`; do not reuse Claude Desktop's `mcpServers` / `args` / `env` shape in OpenCode-facing docs.

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
