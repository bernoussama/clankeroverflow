Classic Neon + Prisma footgun. Here is what is almost certainly happening and how to fix it.

## The root cause

You are pointing `prisma db pull` (introspection) at Neon's **pooled** connection string — the one with `-pooler` in the hostname. That endpoint runs PgBouncer in **transaction mode**, which breaks the prepared statements that Prisma's migration/introspection engine relies on. The query engine hangs waiting on a statement that never resolves cleanly, and you hit the ~30s timeout.

The reason `psql` "works fine" against the same URL is that `psql` doesn't use prepared statements the way Prisma's query engine does, so transaction-mode pooling doesn't trip it up. That's the trap — the URL is valid, it just isn't the right URL for this command.

## The fix: split into two URLs

In your `schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled (-pooler), used by Prisma Client at runtime
  directUrl = env("DIRECT_URL")     // DIRECT (non-pooled), used by db pull / migrate / db push
}
```

- `DATABASE_URL` -> the **pooled** string (host contains `-pooler`), keep `?pgbouncer=true&connection_limit=1` for serverless/runtime use.
- `DIRECT_URL` -> the **direct** string from the Neon console (same creds, host does **not** contain `-pooler`). This is what `db pull`, `prisma migrate dev`, and `prisma db push` must use.

In the Neon Console -> Connect dialog, both strings are shown side by side ("Pooled connection" and "Direct connection"). Copy them into separate env vars.

Optionally bump the connect timeout on the direct URL to absorb Neon cold starts (Neon suspends idle compute after ~5 min, so the first connection after idle can take several seconds):

```dotenv
DIRECT_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require&connect_timeout=30"
```

## pnpm monorepo gotchas (these bite too)

1. **Run Prisma scoped to the package that owns the schema.** From the repo root:

   ```bash
   pnpm --filter @your-scope/db exec prisma db pull
   ```

   Running bare `prisma db pull` at the root resolves `schema.prisma` and `.env` from the wrong directory and silently picks up the wrong/missing env.

2. **`.env` loading location.** Prisma auto-loads `.env` from the directory of `schema.prisma`, not necessarily the repo root. Put a `.env` (with both `DATABASE_URL` and `DIRECT_URL`) next to `schema.prisma` in that package, or load env explicitly. If you use a root `.env`, confirm your tool (e.g. `dotenv-cli`, Turbo `dependsOn: ["^db:generate"]`) actually injects `DIRECT_URL` — a missing `directUrl` env var causes Prisma to fall back to the pooled `url`, reintroducing the hang.

3. **The `prisma` binary resolution.** In pnpm workspaces, use the locally-installed `prisma` via `pnpm exec prisma` or an npm script in the package. A globally-installed `prisma` can resolve the wrong `schema.prisma`.

## Quick verification order

1. Confirm the string you're giving `db pull` has **no `-pooler`** in the host (or is wired via `directUrl`).
2. `echo $DIRECT_URL` from the package dir to confirm it's actually set in that shell.
3. Run `pnpm --filter <pkg> exec prisma db pull` (not bare `prisma`).
4. If it still times out, append `&connect_timeout=60` and retry — if that fixes it, it was a cold-start race, not the pooling issue.

## TL;DR

`db pull` against a Neon **pooled** URL hangs because PgBouncer transaction mode breaks Prisma's introspection statements. Give introspection/migrations the **direct** URL via `directUrl`, keep the **pooled** URL only for the runtime client, and run `prisma` scoped to the owning package in your pnpm workspace.

Sources:

- [Neon | Prisma Documentation](https://www.prisma.io/docs/orm/v6/overview/databases/neon)
- [Connect from Prisma to Neon - Neon Docs](https://neon.com/docs/guides/prisma)
- [Prisma GitHub #20612 - `db pull` with Neon pooled connection](https://github.com/prisma/prisma/issues/20612)
- [Setting Up Prisma + PostgreSQL in a Monorepo (TurboRepo + pnpm)](https://dev.to/wasimadildev/setting-up-prisma-postgresql-in-a-monorepo-turborepo-pnpm-nodejs-4knd)
