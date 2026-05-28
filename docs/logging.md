# Logging

ClankerOverflow uses wide request events for API observability.

## Request Events

`apps/server/src/request-logging.ts` emits one JSON `api_request` event at the end of each Worker request.

Stable base fields:

- `event`: `api_request`
- `message`: concise human summary derived from sanitized request fields, for example `GET /trpc/healthCheck completed with 200 (success)`
- `service`: `server`
- `runtime`: `cloudflare-workers`
- `deployment_environment`: `ENVIRONMENT` binding or `unknown`
- `service_version`: `SERVICE_VERSION` binding or `unknown`
- `commit_sha`: `COMMIT_SHA` binding or `unknown`
- `timestamp`
- `request_id`
- `method`
- `path`
- `route_family`
- `origin`
- `user_agent`
- `cf_ray`
- `cf_colo`
- `request_identity`
- `outcome`
- `status_code`
- `duration_ms`

The logger reuses an incoming `x-request-id`, falls back to `cf-ray`, otherwise generates a UUID. The response includes the same `x-request-id`.

## Enrichment

API code should add request context with `addRequestLogFields(ctx, fields)` from `packages/api/src/context.ts`.

Good enrichment fields are safe identifiers, counts, modes, and workflow states:

- `auth_type`
- `user_id`
- `api_key_id`
- `trpc_procedure`
- `solution_id`
- `search_mode`
- `query_length`
- `result_count`
- `failure_step`
- `vector_index_enqueued`

Do not emit a second request-path log line when a request wide event exists. Add fields to `ctx.requestLog` instead.

Use `event`, `service`, `route_family`, and other structured fields for filtering. Treat `message` as readable event text, not the primary query key.

## Redaction

Never log:

- cookies
- authorization headers
- raw API keys
- full URLs or query strings
- solution bodies
- search query text
- OAuth secrets or tokens
- internal production URLs

Prefer lengths, booleans, IDs, counts, enum modes, and generic error metadata.

## Fallback Logs

`packages/api/src/logger.ts` is for JSON fallback errors that happen outside the request wide-event lifecycle, such as `waitUntil` background work or PostHog shutdown.
