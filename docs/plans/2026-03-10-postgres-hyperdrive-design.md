# Postgres + Hyperdrive Design

## Context

We are replacing SQLite/D1 with PostgreSQL across all environments while keeping the API server on Cloudflare Workers. Production should use Cloudflare Hyperdrive for pooled, low-latency database access, and local development should use Docker Compose.

## Goals

- Replace the Drizzle SQLite driver with Postgres.
- Keep the server running on Cloudflare Workers.
- Use Hyperdrive in production.
- Provide a local Postgres container for dev.

## Non-Goals

- Data migration from existing SQLite/D1 instances.
- Introducing new authentication providers or schema changes beyond type compatibility.

## Architecture

The database layer moves from D1/libsql to node-postgres and Drizzle’s Postgres driver. The server Worker receives a Hyperdrive binding and uses its `connectionString` for DB access. Locally, `DATABASE_URL` points to a Dockerized Postgres instance. Drizzle schema definitions move from `sqlite-core` to `pg-core` with timestamp and boolean columns reflecting Postgres types. Migrations are updated to Postgres SQL and retained in `packages/db/src/migrations`. Better Auth continues to use Drizzle via the adapter, with the provider switched to `postgres`.

## Data Flow

Requests go through the Hono server, which creates a Drizzle client backed by a pooled `pg` connection. Queries and mutations operate against Postgres tables defined in `packages/db/src/schema`. For local dev, the same code path is used, driven by `DATABASE_URL`. For production, Hyperdrive provides the pooled connection string.

## Error Handling

Database initialization will fail fast if neither a Hyperdrive binding nor `DATABASE_URL` is available. This makes misconfiguration obvious in dev and CI. Auth and API layers keep existing error handling behavior.

## Testing

Database integration tests use Postgres with migrations applied before tests run, and tables are cleared between tests. Developers run tests against the local Docker database.
