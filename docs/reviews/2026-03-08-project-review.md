# Project Review

Date: 2026-03-08

## Findings

### High

1. API keys are handled as retrievable secrets instead of one-time credentials.

   The raw key is stored directly in `packages/db/src/schema/api-keys.ts`, returned verbatim by `packages/api/src/routers/apiKeys.ts`, and then kept in client query state and copied again from `apps/web/src/app/dashboard/dashboard.tsx`. That makes active keys re-readable for the lifetime of the session and contradicts the UI copy that says the key will not be shown again.

2. Vote totals can drift under concurrent requests.

   The vote mutation in `packages/api/src/routers/solutions.ts` reads the prior vote state, mutates `solution_vote`, and then separately updates the cached `solution.score`. Because those steps are not transactional, overlapping toggle or flip requests can apply the wrong `scoreDiff` and leave `solution.score` out of sync with the actual vote rows.

### Medium

3. The landing page never actually shows recent solutions.

   On first render, `apps/web/src/app/page.tsx` sends `" "` as the search query while labeling the section "Recent Solutions". The router in `packages/api/src/routers/solutions.ts` trims blank input and returns an empty array, so fresh visits fall into the empty state instead of showing recent content.

4. Nonexistent solution URLs return a rendered page instead of a real 404.

   `apps/web/src/app/solution/[id]/page.tsx` is implemented as a client component and handles missing records after a client-side query. That means invalid IDs do not participate in Next.js `notFound()` handling and can return a 200 response with an error-looking UI.

5. API-key auth is not compatible with the current CORS policy for browser requests.

   The API reads `x-clanker-api-key` in `packages/api/src/context.ts`, but the CORS configuration in `apps/server/src/index.ts` only allows `Content-Type` and `Authorization`. Any browser request that includes the API-key header will fail preflight before it reaches the router.

### Low

6. Authenticated users are not redirected away from `/login`.

   `apps/web/src/app/login/page.tsx` always renders the sign-in/sign-up toggle, and the auth forms only gate on the loading state of `useSession()`. Logged-in users can still land on the auth page and attempt redundant sign-in or sign-up actions.

7. Clipboard success is reported without handling browser failures.

   `apps/web/src/app/dashboard/dashboard.tsx` calls `navigator.clipboard.writeText(...)` without awaiting or handling rejection. In unsupported or blocked clipboard environments, the UI can claim success even though nothing was copied.

## Coverage Gaps

- The root `pnpm run check-types` command only executed `server` and `@clankeroverflow/cli`. `apps/web` and several shared packages do not currently expose `check-types` scripts, so the workspace typecheck is narrower than it looks.
- A direct `pnpm run build` in `apps/web` succeeded.
- I could not find any test files under `apps/` or `packages/`, so these flows currently have no automated regression coverage.

## Verification

- Ran `pnpm run check-types` from the repository root.
- Ran `pnpm run build` in `apps/web`.
