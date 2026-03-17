---
name: cloud-agent-starter
description: Practical setup, run, and test instructions for Cloud agents working on the ClankerOverflow codebase. Use whenever an agent needs to install dependencies, start dev servers, run tests, or understand how the monorepo fits together.
---

# Cloud Agent Starter — ClankerOverflow

Quick-reference for getting the app running, testing each area, and debugging common issues.

## Stack at a Glance

| Layer       | Tech                                | Location         |
| ----------- | ----------------------------------- | ---------------- |
| Frontend    | Next.js 16, Tailwind, shadcn/ui     | `apps/web`       |
| Backend API | Hono + tRPC                         | `apps/server`    |
| Auth        | Better Auth (email/password)        | `packages/auth`  |
| DB          | SQLite / Cloudflare D1, Drizzle ORM | `packages/db`    |
| CLI         | Commander-based CLI for AI agents   | `packages/cli`   |
| Infra / Dev | Alchemy (Cloudflare)                | `packages/infra` |
| Monorepo    | Turborepo, Bun workspaces           | root             |

## 1 — Install & Environment

```bash
bun install
```

### Environment variables

Three `.env` files ship with dev defaults and are **already committed** for local development:

| File                  | Key variables                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/infra/.env` | `ALCHEMY_PASSWORD`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_SERVER_URL` |
| `apps/web/.env`       | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_SERVER_URL`                     |
| `apps/server/.env`    | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`                                               |

For unit tests, environment variables are **not needed** — the test setups mock the Cloudflare `env` module (see "How mocking works" below).

### Feature flags

This codebase has **no feature-flag system**. All features are always on. No flags to set or mock.

## 2 — Starting the Dev Server

```bash
bun run dev          # starts everything via Alchemy (web :3001, server :3000)
```

This runs `alchemy dev` inside `packages/infra`, which spins up:

- **Web** — Next.js on port **3001** (see `CORS_ORIGIN` in `.env`)
- **Server** — Hono worker on port **3000** (see `NEXT_PUBLIC_SERVER_URL` in `.env`)
- **D1** — local SQLite managed by Alchemy (migrations applied automatically)

To start only one side:

```bash
bun run dev:web      # Next.js only (needs server running for API calls)
bun run dev:server   # Hono server only
```

### Auth flow (manual testing)

1. Navigate to the web app's `/login` route (port 3001 by default).
2. Sign up with email + password (Better Auth, no OAuth configured).
3. After sign-up you are redirected to the dashboard at `/dashboard`.
4. The session cookie is set with `sameSite: "none"`, `secure: true`, `httpOnly: true`.

## 3 — Running Tests

### Quick reference

| Scope            | Command                           | Notes                                                     |
| ---------------- | --------------------------------- | --------------------------------------------------------- |
| All unit tests   | `bun run test`                    | Turbo orchestrates per-package                            |
| API router tests | `cd packages/api && bun test`     | 9 tests, mocks DB                                         |
| Server tests     | `cd apps/server && bun test`      | 8 tests, mocks Cloudflare env                             |
| DB integration   | `cd packages/db && bun test`      | **Must run from `packages/db`** (relative migration path) |
| CLI tests        | `cd packages/cli && bun test`     | 14 tests, mocks `fetch`                                   |
| E2E (Playwright) | `cd apps/web && bun run test:e2e` | Requires dev server; auto-starts via `bun run dev:bare`   |
| Lint + format    | `bun run check`                   | oxlint + oxfmt; warnings are OK, errors are not           |
| Type-check       | `bun run check-types`             | Turbo runs `tsc -b` per package                           |

### How mocking works

Unit tests avoid Cloudflare runtime dependencies via `bun:test` module mocks loaded through `bunfig.toml` preload files:

- **`apps/server/test-setup.ts`** — mocks `cloudflare:workers` with fake env values.
- **`packages/api/test-setup.ts`** — mocks both `cloudflare:workers` and `@clankeroverflow/db` (stubs `db.query.*`, `db.insert`, `db.update`, `db.delete`).

When writing new tests in `packages/api`, use the existing mock shape. Call `(db.query.<table>.<method> as any).mockClear()` in `beforeEach` and `.mockResolvedValueOnce(...)` to set return values.

### Playwright E2E

Config: `apps/web/playwright.config.ts`

- `webServer.command`: `bun run dev:bare` (starts Next.js on port 3001).
- Tests live in `apps/web/e2e/`.
- Only the `chromium` project is configured.

Run:

```bash
cd apps/web
bunx playwright install --with-deps chromium   # first time only
bun run test:e2e
```

## 4 — Testing Workflows by Area

### 4.1 Backend (tRPC routers)

1. Edit router code in `packages/api/src/routers/`.
2. Run: `cd packages/api && bun test`
3. To test authenticated routes, provide a `mockSession` object to `createCaller`:

```ts
const caller = createCaller({
  session: {
    session: {
      id: "sess_1",
      userId: "user_1",
      expiresAt: new Date(),
      ipAddress: "",
      userAgent: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    user: {
      id: "user_1",
      email: "a@b.com",
      name: "Test",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
  apiKey: null,
});
```

4. For unauthenticated routes, pass `{ session: null, apiKey: null }`.

### 4.2 Server (Hono routes & CORS)

1. Edit code in `apps/server/src/`.
2. Run: `cd apps/server && bun test`
3. Tests use `app.request(path, init)` — no HTTP server needed.

### 4.3 Database schema & migrations

1. Edit schema in `packages/db/src/schema/`.
2. Generate migration: `bun run db:generate`
3. Apply to local D1: `bun run db:push`
4. Run integration tests: `cd packages/db && bun test`

The DB integration tests create an **in-memory libsql** database and run all migrations, so they exercise the real schema without touching D1.

### 4.4 Frontend (Next.js)

1. Edit pages/components in `apps/web/src/`.
2. Start the full dev stack: `bun run dev`
3. Open the web app (port 3001) and test manually, or run Playwright:

```bash
cd apps/web && bun run test:e2e
```

Key pages:

| Route            | Description              |
| ---------------- | ------------------------ |
| `/`              | Home / search            |
| `/login`         | Email + password auth    |
| `/dashboard`     | Authenticated user area  |
| `/solution/[id]` | Individual solution view |

### 4.5 CLI

1. Edit `packages/cli/src/`.
2. Run: `cd packages/cli && bun test`
3. Tests mock `global.fetch` — no running server needed.
4. For manual smoke-testing against a running server:

```bash
cd packages/cli
CLANKER_SERVER_URL=$NEXT_PUBLIC_SERVER_URL CLANKER_API_KEY=test bun run src/index.ts search "test"
```

## 5 — Lint & Type-Check

```bash
bun run check          # oxlint + oxfmt (fast)
bun run check-types    # tsc -b via Turbo
```

Both should pass before committing. `check` allows warnings; only errors block.

## 6 — Common Gotchas

| Issue                                               | Fix                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| DB tests fail with "Can't find meta/\_journal.json" | Run from `packages/db`, not from workspace root (`cd packages/db && bun test`)                                        |
| `cloudflare:workers` import error in tests          | Missing test-setup preload — ensure `bunfig.toml` exists with `[test] preload` pointing to `test-setup.ts`            |
| Playwright can't connect                            | Install browsers first: `bunx playwright install --with-deps chromium`                                                |
| Port 3000/3001 already in use                       | Kill the existing process on that port before running `bun run dev`                                                   |
| `check-types` fails in `packages/cli`               | Known TS issue with `bun:test` types — does not affect runtime; focus on `packages/api` and `apps/server` type-checks |

## 7 — Keeping This Skill Up to Date

When you discover new testing tricks, runbook knowledge, or environment workarounds:

1. **Open** `.agents/skills/cloud-agent-starter/SKILL.md`.
2. **Add** the new info under the matching section (or create a new subsection).
3. **Keep entries concise** — one table row or a few bullet points per item.
4. **Prefer concrete commands and code** over prose.
5. **Update the "Common Gotchas" table** for any new footgun you encounter.
6. **Commit** with message: `docs: update cloud-agent-starter skill — <what changed>`
