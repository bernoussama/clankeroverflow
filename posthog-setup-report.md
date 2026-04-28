<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into ClankerOverflow's server-side Node.js API (Cloudflare Workers + Hono + tRPC).

**What was done:**
- Installed `posthog-node` v5.29.2 in `packages/api`
- Created a singleton PostHog client (`packages/api/src/posthog.ts`) configured for Cloudflare Workers (serverless) with `flushAt: 1` and `flushInterval: 0` to ensure events are sent immediately per request
- Added five business-critical event captures in `packages/api/src/routers/solutions.ts`
- Added server-level exception capture via `app.onError` in `apps/server/src/index.ts`
- Added `posthog.identify()` in `packages/api/src/context.ts` to attach user email and name to PostHog person records on every authenticated request
- Added `POSTHOG_API_KEY` and `POSTHOG_HOST` environment variables to `apps/server/.env`, `packages/infra/.env`, and `packages/infra/.env.production`
- Added `POSTHOG_API_KEY` and `POSTHOG_HOST` to the Alchemy Worker bindings in `packages/infra/alchemy.run.ts` so the variables are available at runtime in both local dev and production Cloudflare Workers deployments

| Event | Description | File |
|---|---|---|
| `solution logged` | A user submitted a new solution to the knowledge base | `packages/api/src/routers/solutions.ts` |
| `solution voted` | A user voted on a solution (upvote or downvote), with `vote_action` property: `added`, `removed`, or `changed` | `packages/api/src/routers/solutions.ts` |
| `solution searched` | A user searched the knowledge base, with `search_mode` (`keyword`/`semantic`/`hybrid`), `query_length`, and `result_count` properties | `packages/api/src/routers/solutions.ts` |
| `solution viewed` | A user fetched a specific solution by ID (top of conversion funnel) | `packages/api/src/routers/solutions.ts` |
| `solution list viewed` | A user fetched the paginated solution list, with `sort` and `is_paginated` properties | `packages/api/src/routers/solutions.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://eu.posthog.com/project/147805/dashboard/630521
- **Solution Searches Over Time** (daily trend, top of funnel): https://eu.posthog.com/project/147805/insights/ExlKt1pm
- **Solutions Submitted Over Time** (daily submissions): https://eu.posthog.com/project/147805/insights/u9pDNzJN
- **Search → View → Submit Funnel** (conversion funnel): https://eu.posthog.com/project/147805/insights/T6C46dY2
- **Vote Actions Breakdown** (add/remove/change by day): https://eu.posthog.com/project/147805/insights/XTYlJf61
- **Search Mode Usage** (keyword vs. semantic vs. hybrid): https://eu.posthog.com/project/147805/insights/bl4Pywbp
- **Solution List Views Over Time** (daily list views by sort order): https://eu.posthog.com/project/147805/insights/wTPqEVId

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
