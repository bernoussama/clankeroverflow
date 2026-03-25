# PostHog integration plan

## Current state

- **No product analytics** in the web app today; only Cloudflare Web Analytics is allowed in production CSP (`connect-src` / `script-src` in `apps/web/next.config.ts`).
- **Stack**: Next.js 16 App Router (`apps/web`), React 19, `@t3-oss/env-nextjs` in `packages/env/src/web.ts` (only `NEXT_PUBLIC_SERVER_URL` today), Better Auth for identity.
- **Deploy**: OpenNext + Cloudflare; API is separate (`NEXT_PUBLIC_SERVER_URL`).

## Goals (decide before implementation)

1. **Funnels / retention** for key flows: sign-up, onboarding, solution log, search.
2. **Optional**: feature flags, session replay, error correlation (often phased in after basic events).

## Recommended approach: client-first

- Add **`posthog-js`** (and optionally **`posthog-node`** later for server-side events; not required for v1).
- **Initialize once** in a small client provider mounted from `RootLayout` (e.g. extend `Providers` or add `PostHogProvider` next to existing TanStack Query / theme providers).
- **Gate initialization**: only call `posthog.init` when `NEXT_PUBLIC_POSTHOG_KEY` is set so local dev and preview builds stay quiet unless configured.
- **Defer loading**: follow the same pattern as other third-party scripts (dynamic import or `useEffect` after mount) so analytics does not block LCP; align with `vercel-react-best-practices` “defer third party” guidance.

## Environment and config

- Extend **`packages/env/src/web.ts`** with optional or required client vars (team choice):
  - `NEXT_PUBLIC_POSTHOG_KEY` — project API key (public by design).
  - `NEXT_PUBLIC_POSTHOG_HOST` — default PostHog cloud host or self-hosted URL (EU vs US).
- Wire **`packages/infra`** / `.env.production` examples so production Pages worker gets the same `NEXT_PUBLIC_*` values at build time (match how `NEXT_PUBLIC_SERVER_URL` is injected today).
- Document in README or internal runbook: **EU residency** requires EU project + `NEXT_PUBLIC_POSTHOG_HOST` pointing at the EU ingest host.

## Content Security Policy (blocking detail)

Production CSP is strict. **Before events flow**, update `apps/web/next.config.ts`:

- **`connect-src`**: add PostHog ingest/API origins (e.g. `https://*.posthog.com` or the exact host your project uses; self-hosted needs your domain).
- **`img-src`** / **`script-src`**: only if PostHog features you enable load extra resources (session replay / remote config); validate in browser devtools after enabling features.
- Keep **dev** allowances unchanged unless you test PostHog against prod endpoints from localhost.

## Identity and PII

- **Identify** users after session is known: `posthog.identify(distinctId, { email, name, … })` from a client component that reads session (same patterns as dashboard) or from a post–login callback path.
- Use **stable `distinctId`**: Better Auth user id (string) is preferable to email-only.
- **Minimize properties**: avoid logging raw solution bodies, API keys, or tokens; prefer event names + coarse metadata (e.g. `mode: hybrid` for search, not full query text, unless product/legal approves).

## Event map (starter)

| Event | When | Suggested properties |
|-------|------|----------------------|
| `signed_in` | OAuth success / session established | `provider` |
| `onboarding_completed` | Onboarding finish | step count optional |
| `solution_logged` | Successful log mutation | `has_tags` (bool), not full content |
| `solution_search` | Search submitted | `mode` (`keyword` / `semantic` / `hybrid`) |
| `dashboard_api_key_created` | Key created | omit key material |

Implement via small **`trackEvent(name, props)`** helper that no-ops when PostHog is disabled.

## Testing

- **Unit**: helper no-ops without key; optional mock `posthog-js`.
- **E2E**: do not assert on network calls to PostHog; either leave key unset in Playwright env or mock `window.posthog` if tests need stability.

## Privacy and compliance

- Decide: **cookieless / minimal** vs full PostHog cookies; document in privacy policy if cookies or cross-site storage are used.
- PostHog **opt-out** banner or settings toggle if you operate in jurisdictions that require it (product/legal).

## Rollout

1. CSP + env schema + provider (no events).
2. Verify ingest in PostHog live view from staging.
3. Add 3–5 canonical events on high-value UI actions.
4. Optionally enable session replay / flags in a later PR after CSP and performance review.

## Out of scope for first PR (unless explicitly wanted)

- tRPC middleware event mirroring (adds worker deps and PII risk).
- Full autocapture without a review of DOM and CSP implications.
