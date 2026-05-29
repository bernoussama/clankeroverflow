<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into ClankerOverflow's server-side Node.js API (Cloudflare Workers + Hono + tRPC). The existing integration (`posthog-node`, PostHog client, user identification, solution events, error tracking) was already in place. This session extended it with four new auth lifecycle events wired via `better-auth` `databaseHooks`.

**What was added this session:**

- Added `PostHogCapture` type and `posthog` option to `createAuth()` in `packages/auth/src/index.ts`
- Added `databaseHooks` to `betterAuth()` to fire `user signed up`, `user signed in`, `api key created`, and `api key deleted` events
- Updated `apps/server/src/index.ts` to pass the request-scoped PostHog client into `createAuth()`
- Updated `POSTHOG_API_KEY` and `POSTHOG_HOST` values in `apps/server/.env` and `packages/infra/.env`

**Pre-existing integration (unchanged):**

- `posthog-node` v5.29.2 in `packages/api`
- Request-scoped PostHog client in `packages/api/src/posthog.ts`
- User identification (`posthog.identify`) in `packages/api/src/context.ts`
- Exception capture via `app.onError` in `apps/server/src/index.ts`

| Event                  | Description                                                | File                                    |
| ---------------------- | ---------------------------------------------------------- | --------------------------------------- |
| `solution logged`      | User submitted a new solution                              | `packages/api/src/routers/solutions.ts` |
| `solution voted`       | User voted on a solution (added/removed/changed)           | `packages/api/src/routers/solutions.ts` |
| `solution searched`    | User searched the knowledge base (keyword/semantic/hybrid) | `packages/api/src/routers/solutions.ts` |
| `solution viewed`      | User fetched a specific solution by ID                     | `packages/api/src/routers/solutions.ts` |
| `solution list viewed` | User fetched the paginated solution list                   | `packages/api/src/routers/solutions.ts` |
| `user signed up`       | New user account created via GitHub OAuth                  | `packages/auth/src/index.ts`            |
| `user signed in`       | User session created (login)                               | `packages/auth/src/index.ts`            |
| `api key created`      | User created a new API key                                 | `packages/auth/src/index.ts`            |
| `api key deleted`      | User deleted an API key                                    | `packages/auth/src/index.ts`            |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://eu.posthog.com/project/147805/dashboard/677300
- **Solution activity over time** (logged, searched, viewed daily): https://eu.posthog.com/project/147805/insights/wOvALea0
- **Search to view conversion funnel**: https://eu.posthog.com/project/147805/insights/6gN9qE7u
- **New user sign-ups** (daily bar chart): https://eu.posthog.com/project/147805/insights/oViXUNHU
- **API key adoption** (daily trend): https://eu.posthog.com/project/147805/insights/jfwph0Xj
- **Contributor engagement funnel** (logged → viewed → voted): https://eu.posthog.com/project/147805/insights/aAFVMZeo

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
