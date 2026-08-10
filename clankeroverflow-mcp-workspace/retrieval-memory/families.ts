import type { FixFamily } from "./types.js";

type FamilyInput = Omit<FixFamily, "alternateRootCause" | "noUsefulQuery">;

function defineFamily(
  input: FamilyInput,
  alternateRootCause: FixFamily["alternateRootCause"],
  noUsefulQuery: FixFamily["noUsefulQuery"],
): FixFamily {
  return { ...input, alternateRootCause, noUsefulQuery };
}

export const familyDefinitions: FixFamily[] = [
  defineFamily(
    {
      id: "vite-container-host",
      stratum: "javascript-tooling",
      title: "Vite dev server is unreachable from a container",
      packageName: "vite",
      versions: { vite: "5.x", node: "20.x" },
      runtime: "Node.js",
      toolchain: "Vite 5",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["docker", "linux"],
      commitRange: "main..7c2a1f4",
      problem:
        "A Vite 5 dev server works inside a Linux container but the host browser gets ERR_CONNECTION_REFUSED.",
      rootCause:
        "Vite is bound to the container loopback interface, so the published port is not reachable from the host network namespace.",
      rootCauseKey: "bind-loopback",
      solution:
        "Bind Vite to 0.0.0.0 with server.host or pnpm vite --host 0.0.0.0, then keep the container port published and verify readiness from the host.",
      verification: [
        "pnpm vite --host 0.0.0.0 served the app on the published port.",
        "curl from the host received the Vite index without changing application code.",
      ],
      fingerprints: ["ERR_CONNECTION_REFUSED", "vite --host", "container published port"],
      files: ["vite.config.ts", "package.json", "compose.yaml"],
      commands: ["pnpm vite --host 0.0.0.0", "curl http://localhost:5173"],
      errors: ["ERR_CONNECTION_REFUSED", "Vite server unreachable"],
      tags: ["vite", "containers", "networking", "javascript"],
    },
    {
      key: "wrong-interface",
      problem: "The Vite port is reachable but HMR fails after a reverse proxy is added.",
      rootCause:
        "The WebSocket client is using the internal container hostname rather than the proxy-facing HMR host.",
      solution:
        "Keep server.host for reachability, then set the proxy-facing HMR host and protocol separately; changing only the bind address does not repair proxied WebSockets.",
      verification: [
        "The browser HMR WebSocket connected through the proxy and refreshed after a file edit.",
      ],
      fingerprints: ["Vite HMR WebSocket", "reverse proxy hmr host"],
    },
    {
      problem: "No useful Vite memory applies to a browser certificate failure.",
      error: "NET::ERR_CERT_AUTHORITY_INVALID",
    },
  ),
  defineFamily(
    {
      id: "typescript-pnpm-workspace",
      stratum: "javascript-tooling",
      title: "TypeScript cannot resolve a pnpm workspace dependency",
      packageName: "typescript",
      versions: { typescript: "5.8.x", pnpm: "11.x", node: "20.x" },
      runtime: "Node.js",
      toolchain: "TypeScript 5.8",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["linux", "ci"],
      commitRange: "main..33d7a9e",
      problem:
        "TypeScript reports TS2307 Cannot find module for a pnpm workspace package that runs at runtime.",
      rootCause:
        "The package is available through a local path or editor alias but is missing from the consumer package dependency graph.",
      rootCauseKey: "missing-workspace-edge",
      solution:
        "Declare the sibling package as a workspace:* dependency in the consuming package, run pnpm install, and expose real declaration files from the dependency exports.",
      verification: [
        "pnpm install followed by pnpm exec tsc --noEmit resolved the workspace package without a paths-only alias.",
      ],
      fingerprints: ["TS2307", "pnpm workspace:*", "Cannot find module"],
      files: ["packages/app/package.json", "packages/shared/package.json", "tsconfig.json"],
      commands: ["pnpm install", "pnpm exec tsc --noEmit"],
      errors: ["TS2307 Cannot find module"],
      tags: ["typescript", "pnpm", "monorepo", "workspace"],
    },
    {
      key: "paths-only-alias",
      problem:
        "The workspace package resolves in the editor but the bundler cannot load it in production.",
      rootCause:
        "A tsconfig paths alias masks a missing package export and dependency edge during local development.",
      solution:
        "Add a real workspace dependency and package exports first; keep paths aliases only as editor conveniences and verify the built consumer from a clean install.",
      verification: [
        "A clean pnpm install and production bundle loaded the package through its declared export.",
      ],
      fingerprints: ["TS2307 paths alias", "workspace package export"],
    },
    {
      problem: "No useful TypeScript memory applies to a decorator metadata runtime error.",
      error: "Reflect metadata is undefined at runtime",
    },
  ),
  defineFamily(
    {
      id: "eslint-flat-config-plugin",
      stratum: "javascript-tooling",
      title: "ESLint 9 flat config cannot load a legacy plugin",
      packageName: "eslint",
      versions: { eslint: "9.x", node: "20.x" },
      runtime: "Node.js",
      toolchain: "ESLint 9 flat config",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["linux", "ci"],
      commitRange: "main..a8e4c21",
      problem:
        "ESLint 9 reports that a plugin cannot be loaded after a project switches from .eslintrc to eslint.config.js.",
      rootCause:
        "The plugin still expects legacy config resolution and is being passed as a string instead of an imported plugin object in flat config.",
      rootCauseKey: "legacy-plugin-flat-config",
      solution:
        "Import the plugin object in eslint.config.js, register it under the plugins map, and use the plugin's flat-config-compatible rules or a compatibility wrapper.",
      verification: [
        "pnpm exec eslint . completed with the flat config and the plugin rules enabled.",
      ],
      fingerprints: ["ESLint 9", "eslint.config.js", "flat config plugin"],
      files: ["eslint.config.js", "package.json", "pnpm-lock.yaml"],
      commands: ["pnpm exec eslint .", "pnpm exec eslint --print-config src/index.ts"],
      errors: ["Plugin was not found", "ESLint flat config plugin"],
      tags: ["eslint", "flat-config", "javascript", "tooling"],
    },
    {
      key: "legacy-config-path",
      problem: "ESLint loads the plugin but ignores a rule after a shareable config is extended.",
      rootCause:
        "The shareable config is still being loaded through legacy extends order, not a plugin registration failure.",
      solution:
        "Convert the shareable config into flat-config objects and verify the final rule with --print-config; do not fix this by adding another plugin package.",
      verification: [
        "--print-config showed the expected rule and lint output matched the converted shareable config.",
      ],
      fingerprints: ["ESLint --print-config", "flat shareable config"],
    },
    {
      problem: "No useful ESLint memory applies to a parser syntax error in a generated file.",
      error: "Parsing error: Unexpected token in generated output",
    },
  ),
  defineFamily(
    {
      id: "vitest-esm-setup",
      stratum: "javascript-tooling",
      title: "Vitest setup file fails at the CommonJS and ESM boundary",
      packageName: "vitest",
      versions: { vitest: "4.x", vite: "7.x", node: "22.x" },
      runtime: "Node.js",
      toolchain: "Vitest 4 and Vite 7",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["linux", "ci"],
      commitRange: "main..c9f022d",
      problem:
        "Vitest fails before tests run with a require() of ES Module error after the package is marked type: module.",
      rootCause:
        "The setup file is loaded through a CommonJS path while the project and dependency graph now require ESM evaluation.",
      rootCauseKey: "vitest-esm-boundary",
      solution:
        "Use an ESM setup file referenced by the Vitest config, keep imports and test files consistently ESM, and remove a stale CommonJS require hook from the test command.",
      verification: [
        "pnpm vitest run loaded the setup file and executed the test suite without the module-format error.",
      ],
      fingerprints: ["require() of ES Module", "Vitest setupFiles", "type: module"],
      files: ["vitest.config.ts", "vitest.setup.ts", "package.json"],
      commands: ["pnpm vitest run", "pnpm exec vitest --config vitest.config.ts"],
      errors: ["require() of ES Module", "Vitest failed to load setup file"],
      tags: ["vitest", "vite", "esm", "testing"],
    },
    {
      key: "vitest-transform-mode",
      problem:
        "A Vitest test imports a package but receives a browser-transform error only in one workspace.",
      rootCause:
        "The package needs a Vite dependency optimization rule, not a change to the Node module format.",
      solution:
        "Configure the affected dependency in server.deps.inline or optimizeDeps for the workspace and keep the ESM setup unchanged.",
      verification: [
        "The isolated workspace test passed with the dependency transform configured.",
      ],
      fingerprints: ["Vitest server.deps.inline", "Vite dependency transform"],
    },
    {
      problem: "No useful Vitest memory applies to a snapshot serializer mismatch.",
      error: "Snapshot does not match serialized output",
    },
  ),
  defineFamily(
    {
      id: "npm-peer-dependency-runtime",
      stratum: "javascript-tooling",
      title: "A package peer dependency is missing only in a pnpm production install",
      packageName: "npm",
      versions: { npm: "10.x", node: "20.x", pnpm: "11.x" },
      runtime: "Node.js",
      toolchain: "pnpm strict dependency graph",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["linux", "ci"],
      commitRange: "main..a2e91f0",
      problem:
        "A JavaScript package resolves in a hoisted development install but production fails because a peer dependency is missing.",
      rootCause:
        "The consumer relied on an undeclared transitive peer dependency that pnpm's strict symlinked graph does not make available in production.",
      rootCauseKey: "pnpm-peer-dependency-edge",
      solution:
        "Declare the required peer dependency in the consuming package, run pnpm install --frozen-lockfile, and verify the packed production artifact from a clean store.",
      verification: [
        "A clean pnpm install and production smoke test loaded the package without relying on hoisting.",
      ],
      fingerprints: [
        "pnpm missing peer dependency",
        "strict dependency graph",
        "works with hoisting",
      ],
      files: ["package.json", "pnpm-lock.yaml", "scripts/pack-smoke.ts"],
      commands: [
        "pnpm install --frozen-lockfile",
        "pnpm pack",
        "pnpm exec node scripts/pack-smoke.ts",
      ],
      errors: ["ERR_PNPM_MISSING_PEER", "Cannot find package peer dependency"],
      tags: ["pnpm", "npm", "node", "dependencies"],
    },
    {
      key: "bundler-resolve-peer",
      problem:
        "The peer dependency is declared but the bundler externalizes it from the browser artifact.",
      rootCause:
        "The package edge exists; the production bundler target or external dependency setting is wrong.",
      solution:
        "Inspect the final bundle's external list and configure the browser dependency boundary; do not add a second package declaration for an already resolved peer.",
      verification: [
        "The browser artifact contained the intended peer dependency and loaded in a clean preview.",
      ],
      fingerprints: ["bundler external peer dependency", "package is declared but not bundled"],
    },
    {
      problem: "No useful npm memory applies to a registry authentication failure.",
      error: "npm ERR! code E401 Unable to authenticate",
    },
  ),
  defineFamily(
    {
      id: "stripe-workers-raw-body",
      stratum: "web-auth-ssr",
      title: "Stripe webhook verification on a Web Crypto runtime",
      packageName: "stripe",
      versions: { stripe: "18.x", "cloudflare-workers": "2026.x" },
      runtime: "Cloudflare Workers Web Crypto",
      toolchain: "Wrangler 4",
      packageManager: "pnpm 11.x",
      os: "managed-edge",
      architecture: "wasm32",
      platforms: ["cloudflare-workers", "webcrypto"],
      commitRange: "main..f1b5d8a",
      problem:
        "Stripe webhook signature verification crashes on Cloudflare Workers even though it works in Node development.",
      rootCause:
        "The sync stripe-node verification path expects Node crypto APIs and the request body was parsed before signature verification.",
      rootCauseKey: "webcrypto-raw-body",
      solution:
        "Read the raw request body unchanged and call stripe.webhooks.constructEventAsync with the stripe-signature header; avoid JSON parsing and the sync constructEvent path on Web Crypto runtimes.",
      verification: [
        "A signed test event verified in a Worker while the exact raw body and signature header were preserved.",
      ],
      fingerprints: ["constructEventAsync", "Cloudflare Workers", "stripe-signature raw body"],
      files: ["src/webhook.ts", "wrangler.toml", "package.json"],
      commands: ["pnpm wrangler dev", "curl -X POST /webhooks/stripe"],
      errors: [
        "crypto.createHmac is not a function",
        "Stripe webhook signature verification failed",
      ],
      tags: ["stripe", "cloudflare-workers", "webcrypto", "webhooks"],
    },
    {
      key: "parsed-body",
      problem: "The signature is rejected only after a framework middleware is enabled.",
      rootCause:
        "Middleware serialized and reformatted the JSON before the signature check, while the crypto runtime itself is supported.",
      solution:
        "Disable body parsing for the webhook route and verify the original bytes before any JSON decoding; constructEventAsync alone does not restore changed bytes.",
      verification: [
        "The webhook passed with middleware enabled for other routes and disabled only for the raw webhook route.",
      ],
      fingerprints: ["Stripe parsed request body", "webhook middleware raw bytes"],
    },
    {
      problem: "A generated payment test refers to an unknown Stripe event fingerprint.",
      error: "Stripe event fixture has no signature header",
    },
  ),
  defineFamily(
    {
      id: "better-auth-preview-cookie",
      stratum: "web-auth-ssr",
      title: "Better Auth session cookie disappears on a preview hostname",
      packageName: "better-auth",
      versions: { "better-auth": "1.3.x", next: "15.x", node: "20.x" },
      runtime: "Next.js Node runtime",
      toolchain: "Next.js App Router",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["vercel-preview", "node"],
      commitRange: "main..4de9b0c",
      problem:
        "Better Auth login succeeds locally but the session cookie is missing after the OAuth callback on a preview deployment.",
      rootCause:
        "The preview origin, secure cookie policy, and trusted origin configuration do not agree, so the browser rejects or omits the callback cookie.",
      rootCauseKey: "auth-preview-origin",
      solution:
        "Configure the exact preview origin as trusted, use secure cookies on HTTPS, and align the callback URL and cookie SameSite/domain settings with the preview hostname.",
      verification: [
        "A fresh preview browser context retained the session cookie through login and a protected route returned 200.",
      ],
      fingerprints: [
        "Better Auth trustedOrigins",
        "OAuth preview cookie",
        "SameSite secure session",
      ],
      files: ["src/lib/auth.ts", "src/middleware.ts", ".env.example"],
      commands: ["pnpm exec next dev", "curl -I https://preview.example.test/api/auth/session"],
      errors: ["session cookie missing", "OAuth callback unauthorized"],
      tags: ["better-auth", "oauth", "cookies", "nextjs"],
    },
    {
      key: "callback-session-context",
      problem: "Invitation acceptance reports an undefined session for an already logged-in user.",
      rootCause:
        "The organization helper was called without the incoming authenticated request context, not because the preview cookie policy is wrong.",
      solution:
        "Pass the authenticated request headers and cookies into the organization helper and keep the auth handler and organization plugin on the same base URL.",
      verification: [
        "The invitation accepted from the protected page and the organization membership appeared in the same session.",
      ],
      fingerprints: [
        "Better Auth organization invitation session",
        "authenticated request context",
      ],
    },
    {
      problem: "A preview app has no stored solution for an unrelated OAuth provider error.",
      error: "OAuth provider returned invalid_scope",
    },
  ),
  defineFamily(
    {
      id: "inertia-head-ssr-off",
      stratum: "web-auth-ssr",
      title: "Inertia head metadata is missing from initial HTML",
      packageName: "@inertiajs/react",
      versions: { inertia: "2.x", laravel: "12.x", php: "8.3.x" },
      runtime: "Laravel PHP runtime",
      toolchain: "Vite 6",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["laravel", "browser"],
      commitRange: "main..d0b472a",
      problem:
        "Inertia Head tags appear after hydration but crawler-visible title and noindex are absent from the initial Laravel page source.",
      rootCause:
        "Inertia SSR is disabled, so Head updates are client-side only and cannot affect the first HTML response.",
      rootCauseKey: "inertia-ssr-disabled",
      solution:
        "Put crawler-critical head directives in the Laravel Blade shell or emit X-Robots-Tag from the route; enable Inertia SSR only when the complete head/body must be server rendered.",
      verification: [
        "curl of the route contained the expected noindex directive before JavaScript executed.",
      ],
      fingerprints: ["Inertia SSR disabled", "Head initial HTML", "X-Robots-Tag"],
      files: ["resources/views/app.blade.php", "routes/web.php", "resources/js/Pages/"],
      commands: ["curl -s https://example.test/private | rg noindex", "pnpm build"],
      errors: ["meta tags missing from initial HTML", "Inertia Head crawler"],
      tags: ["inertia", "laravel", "ssr", "seo"],
    },
    {
      key: "inertia-title-race",
      problem:
        "The page source contains a title but the hydrated title flickers during navigation.",
      rootCause:
        "A client-side navigation race replaces document metadata after hydration; SSR availability is not the missing-source problem.",
      solution:
        "Make the page head state deterministic across visits and avoid competing document-title effects; do not move crawler directives back into the Blade shell solely to fix a hydration race.",
      verification: [
        "Repeated client navigations kept the title stable while the initial response remained unchanged.",
      ],
      fingerprints: ["Inertia document title navigation race", "Head flicker"],
    },
    {
      problem: "No stored Inertia solution applies to a database migration lock timeout.",
      error: "php artisan migrate lock timeout",
    },
  ),
  defineFamily(
    {
      id: "next-locale-proxy-header",
      stratum: "web-auth-ssr",
      title: "Next.js locale landing path uses the wrong root document locale",
      packageName: "next",
      versions: { next: "15.x", node: "20.x", react: "19.x" },
      runtime: "Next.js App Router",
      toolchain: "Next.js middleware/proxy",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["nextjs", "node"],
      commitRange: "main..e2a67c0",
      problem:
        "A localized Next.js landing route renders translated content but the root html lang and later auth pages use the default locale.",
      rootCause:
        "Server locale detection reads a cookie that has not been established during the first request, so the root layout cannot see the path locale.",
      rootCauseKey: "next-locale-first-request",
      solution:
        "Validate the locale in Next.js Proxy, forward it in a request header for the same request, set a long-lived SameSite=Lax locale cookie, and resolve header before cookie before default.",
      verification: [
        "A fresh browser context returned the expected html lang and kept the locale through login and forgot-password navigation.",
      ],
      fingerprints: ["Next.js Proxy locale header", "html lang first request", "locale cookie"],
      files: ["proxy.ts", "app/layout.tsx", "src/lib/locale.ts"],
      commands: ["pnpm next dev", "curl -I https://example.test/fr"],
      errors: ["wrong html lang", "auth page falls back to default locale"],
      tags: ["nextjs", "app-router", "i18n", "cookies"],
    },
    {
      key: "next-locale-cache",
      problem: "The locale header is correct but a statically cached page keeps another language.",
      rootCause:
        "The route cache key does not vary on the locale input; proxy propagation itself is working.",
      solution:
        "Make the locale part of the route or cache key and invalidate the stale deployment cache; do not remove the validated request header.",
      verification: ["Two locales produced separate cached responses after a clean build."],
      fingerprints: ["Next.js locale cache key", "localized route cache"],
    },
    {
      problem: "No useful locale memory applies to a malformed JWT signature.",
      error: "JWT signature verification failed",
    },
  ),
  defineFamily(
    {
      id: "tanstack-rollback-context",
      stratum: "web-auth-ssr",
      title: "TanStack Query optimistic update does not roll back",
      packageName: "@tanstack/react-query",
      versions: { "@tanstack/react-query": "5.x", react: "19.x" },
      runtime: "Browser React runtime",
      toolchain: "Vite 7",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["browser", "node"],
      commitRange: "main..be1a7cd",
      problem:
        "A TanStack Query v5 optimistic mutation leaves the optimistic value in cache when the request fails.",
      rootCause:
        "onMutate does not return a rollback context or the mutation function swallows its rejection, so onError has no context and may never run.",
      rootCauseKey: "tanstack-mutation-context",
      solution:
        "Snapshot the previous query data in onMutate, return it as context, let mutationFn reject, and restore that context in onError before invalidating the exact query key.",
      verification: [
        "A rejected mutation restored the prior value and the subsequent invalidation fetched server state.",
      ],
      fingerprints: [
        "TanStack Query v5 onMutate context",
        "optimistic rollback onError",
        "mutationFn rejects",
      ],
      files: ["src/features/items/use-update-item.ts", "src/lib/query-client.ts"],
      commands: ["pnpm vitest run update-item", "pnpm exec tsc --noEmit"],
      errors: ["optimistic update does not rollback", "onError context undefined"],
      tags: ["tanstack-query", "react", "optimistic-updates", "cache"],
    },
    {
      key: "query-key-mismatch",
      problem: "The rollback works but the UI shows stale data after the mutation succeeds.",
      rootCause:
        "The invalidation targets a different query key or a route cache above React Query is still serving an older loader response.",
      solution:
        "Invalidate the exact client-created key, await invalidation, and inspect route/SSR cache layers; do not change onMutate context handling for a successful-write staleness problem.",
      verification: [
        "The exact query key refetched and the UI updated without altering rollback behavior.",
      ],
      fingerprints: ["TanStack Query invalidation exact query key", "SSR cache stale mutation"],
    },
    {
      problem: "No stored React Query solution applies to a browser CSP violation.",
      error: "Refused to load script because it violates script-src",
    },
  ),
  defineFamily(
    {
      id: "prisma-neon-direct-url",
      stratum: "databases",
      title: "Prisma schema operations time out through a pooled Neon URL",
      packageName: "prisma",
      versions: { prisma: "6.x", neon: "serverless-driver", postgres: "16.x" },
      runtime: "Node.js server runtime",
      toolchain: "Prisma CLI",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["neon", "postgres"],
      commitRange: "main..a41c2de",
      problem:
        "Prisma db pull and migrations time out against Neon while application queries through the pooled URL work.",
      rootCause:
        "PgBouncer transaction pooling is suitable for runtime traffic but schema operations need a direct database connection.",
      rootCauseKey: "prisma-neon-direct-url",
      solution:
        "Keep the pooled Neon URL for Prisma Client and configure a direct non-pooler URL with datasource directUrl for schema operations; run Prisma from the package that owns the schema.",
      verification: [
        "pnpm prisma db pull and pnpm prisma migrate deploy completed through the direct URL while runtime traffic continued using the pooler.",
      ],
      fingerprints: ["Prisma Neon directUrl", "PgBouncer migration timeout", "prisma db pull"],
      files: ["prisma/schema.prisma", "packages/db/package.json", ".env.example"],
      commands: ["pnpm prisma db pull", "pnpm prisma migrate deploy"],
      errors: ["P1001 Can't reach database server", "Prisma migration timeout"],
      tags: ["prisma", "neon", "postgres", "pooling"],
    },
    {
      key: "neon-first-query",
      problem: "The first query against a newly created Neon preview branch times out.",
      rootCause:
        "The branch API returned before compute was query-ready; the pooler/direct URL distinction is not the primary issue.",
      solution:
        "Poll a lightweight direct query with bounded retry and backoff before migrations or tests, separating readiness timeout from application query timeout.",
      verification: [
        "Preview setup waited for a successful readiness query before running migrations.",
      ],
      fingerprints: ["Neon branch first query timeout", "database readiness retry"],
    },
    {
      problem: "No useful Prisma memory applies to a missing generated client type.",
      error: "Prisma Client could not locate the Query Engine",
    },
  ),
  defineFamily(
    {
      id: "drizzle-migration-lock",
      stratum: "databases",
      title: "Drizzle migration runner collides in parallel CI jobs",
      packageName: "drizzle-orm",
      versions: { "drizzle-orm": "0.44.x", postgres: "16.x", node: "20.x" },
      runtime: "Node.js database runtime",
      toolchain: "Drizzle Kit",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["postgres", "github-actions"],
      commitRange: "main..e7f1b2c",
      problem:
        "Two Drizzle Kit jobs occasionally apply the same PostgreSQL migration and leave a partial migration state.",
      rootCause:
        "CI jobs share a database without a migration advisory lock or isolated branch, so the migration runner is not serialized.",
      rootCauseKey: "postgres-migration-advisory-lock",
      solution:
        "Serialize migration application with a PostgreSQL advisory lock or give each CI job an isolated database branch; keep schema generation separate from applying migrations.",
      verification: [
        "A parallel CI replay applied the migration once per database and no partial journal rows remained.",
      ],
      fingerprints: [
        "Drizzle migration advisory lock",
        "parallel CI migrations",
        "drizzle-kit push",
      ],
      files: ["drizzle.config.ts", "packages/db/src/migrate.ts", ".github/workflows/test.yml"],
      commands: ["pnpm drizzle-kit generate", "pnpm tsx packages/db/src/migrate.ts"],
      errors: ["duplicate migration", "migration journal conflict"],
      tags: ["drizzle", "postgres", "migrations", "ci"],
    },
    {
      key: "drizzle-schema-drift",
      problem:
        "Drizzle reports schema drift after a developer edits the schema without generating a migration.",
      rootCause: "The migration artifact is missing; concurrent application is not involved.",
      solution:
        "Generate and review a new migration from the schema change, then apply it in one controlled job; do not add an advisory lock as a substitute for a missing migration file.",
      verification: [
        "The generated migration matched the intended schema diff and CI applied it once.",
      ],
      fingerprints: ["Drizzle schema drift", "drizzle-kit generate migration"],
    },
    {
      problem: "No stored database memory applies to a Redis JSON serialization error.",
      error: "Unexpected token in Redis JSON payload",
    },
  ),
  defineFamily(
    {
      id: "sqlite-wal-busy-timeout",
      stratum: "databases",
      title: "SQLite WAL writer reports SQLITE_BUSY under a long reader",
      packageName: "better-sqlite3",
      versions: { sqlite: "3.45.x", "better-sqlite3": "11.x", node: "20.x" },
      runtime: "Node.js local runtime",
      toolchain: "SQLite WAL",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["sqlite", "local"],
      commitRange: "main..6a0f93d",
      problem:
        "A SQLite writer intermittently returns SQLITE_BUSY while a read transaction remains open for a long time.",
      rootCause:
        "WAL allows readers and writers to overlap, but a long reader can prevent checkpoints and the writer has no bounded busy timeout.",
      rootCauseKey: "sqlite-wal-long-reader",
      solution:
        "Enable WAL, set a bounded busy timeout, keep read transactions short, and checkpoint after long readers finish; do not delete the WAL file while a process is using the database.",
      verification: [
        "A concurrent reader/writer test completed without SQLITE_BUSY after the timeout and transaction lifetime changes.",
      ],
      fingerprints: ["SQLITE_BUSY WAL", "SQLite long reader checkpoint", "busy_timeout"],
      files: ["src/db.ts", "src/repository.ts", "test/concurrency.test.ts"],
      commands: ["pnpm vitest run concurrency", "sqlite3 app.db 'PRAGMA journal_mode=WAL;'"],
      errors: ["SQLITE_BUSY", "database is locked"],
      tags: ["sqlite", "wal", "better-sqlite3", "concurrency"],
    },
    {
      key: "sqlite-schema-lock",
      problem: "A schema migration receives SQLITE_BUSY before any application reader starts.",
      rootCause:
        "Another process holds a schema lock during migration; a WAL busy timeout does not fix an uncoordinated migration owner.",
      solution:
        "Coordinate migrations with a process lock and close every connection before schema changes; retain WAL settings for normal read/write overlap.",
      verification: [
        "The migration ran after the process lock was acquired and normal concurrent reads remained available.",
      ],
      fingerprints: ["SQLite schema lock migration", "SQLITE_BUSY before reader"],
    },
    {
      problem: "No useful SQLite memory applies to a corrupted database header.",
      error: "file is not a database",
    },
  ),
  defineFamily(
    {
      id: "upstash-redis-tls-url",
      stratum: "databases",
      title: "Redis TLS client rejects an Upstash connection URL",
      packageName: "ioredis",
      versions: { ioredis: "5.x", upstash: "2026.x", node: "20.x" },
      runtime: "Node.js server runtime",
      toolchain: "ioredis TLS",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["upstash", "tls"],
      commitRange: "main..b28e1c0",
      problem:
        "An ioredis client fails TLS negotiation against an Upstash URL even though the same credentials work with the REST API.",
      rootCause:
        "The URL is being passed through a parser that drops the rediss scheme and the client is opening a plaintext Redis connection.",
      rootCauseKey: "redis-rediss-scheme",
      solution:
        "Preserve the rediss:// scheme or pass an explicit tls option to ioredis, avoid logging the credential-bearing URL, and verify the TCP endpoint with a minimal ping.",
      verification: [
        "A rediss connection returned PONG from the disposable database without exposing the URL in logs.",
      ],
      fingerprints: ["ioredis rediss TLS", "Upstash PONG", "Redis TLS negotiation"],
      files: ["src/redis.ts", "src/env.ts", "package.json"],
      commands: ["pnpm vitest run redis", "redis-cli --tls -u rediss://... ping"],
      errors: ["Redis connection closed", "wrong version number TLS"],
      tags: ["redis", "ioredis", "upstash", "tls"],
    },
    {
      key: "redis-auth-credentials",
      problem: "Redis connects over TLS but AUTH fails after rotating the token.",
      rootCause:
        "The endpoint and TLS negotiation are correct; the application is using an expired credential or wrong username.",
      solution:
        "Rotate the credential in the runtime secret store and verify the username/token pair separately; do not alter TLS transport settings for an authentication failure.",
      verification: [
        "The rotated credential authenticated and the connection returned PONG over the existing TLS transport.",
      ],
      fingerprints: ["Redis AUTH failed after rotation", "ioredis username token"],
    },
    {
      problem: "No stored Redis memory applies to an eviction policy alert.",
      error: "Redis maxmemory policy evicted key",
    },
  ),
  defineFamily(
    {
      id: "supabase-rls-service-role",
      stratum: "databases",
      title: "Supabase row-level security blocks a server-side read",
      packageName: "@supabase/supabase-js",
      versions: { "@supabase/supabase-js": "2.x", postgres: "15.x" },
      runtime: "Node.js server runtime",
      toolchain: "Supabase PostgREST",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["supabase", "postgres"],
      commitRange: "main..d17c3a8",
      problem:
        "A Supabase server route receives an empty result because row-level security is enabled on the table.",
      rootCause:
        "The route uses the anon client without a user JWT or a deliberately scoped service-role client, so RLS correctly filters rows.",
      rootCauseKey: "supabase-rls-client-role",
      solution:
        "Choose explicitly between a user-scoped client with matching RLS policies and a server-only service-role client; never expose the service-role key to the browser, then verify the policy with a role-specific test.",
      verification: [
        "A server test with the intended role returned only authorized rows and the browser client remained subject to RLS.",
      ],
      fingerprints: ["Supabase RLS empty result", "service role server client", "anon JWT policy"],
      files: ["src/lib/supabase-server.ts", "supabase/migrations/", "src/app/api/"],
      commands: ["pnpm vitest run supabase", "supabase db reset"],
      errors: [
        "Supabase row-level security returned no rows",
        "new row violates row-level security policy",
      ],
      tags: ["supabase", "rls", "postgres", "authorization"],
    },
    {
      key: "supabase-policy-condition",
      problem: "The service-role client still cannot insert a row through a database trigger.",
      rootCause:
        "The trigger or check constraint rejects the data after authorization; RLS bypass is not the failing layer.",
      solution:
        "Inspect the trigger and constraint error, then fix the row invariant; do not weaken RLS or expose the service key.",
      verification: [
        "The insert passed after the trigger invariant was corrected and policy coverage remained unchanged.",
      ],
      fingerprints: ["Supabase trigger constraint service role", "RLS bypass but insert fails"],
    },
    {
      problem: "No useful Supabase memory applies to an expired JWT clock skew.",
      error: "JWT expired at invalid timestamp",
    },
  ),
  defineFamily(
    {
      id: "cloudflare-worker-cpu-upload",
      stratum: "cloud-runtimes",
      title: "Cloudflare Worker exceeds CPU time during an image upload",
      packageName: "hono",
      versions: { hono: "4.x", wrangler: "4.x", "cloudflare-workers": "2026.x" },
      runtime: "Cloudflare Workers isolate",
      toolchain: "Wrangler 4",
      packageManager: "pnpm 11.x",
      os: "managed-edge",
      architecture: "wasm32",
      platforms: ["cloudflare-workers", "r2"],
      commitRange: "main..f8b12e6",
      problem:
        "A Hono upload route exceeds Cloudflare Worker CPU time only when it performs an image transform.",
      rootCause:
        "CPU-heavy image work runs inside the request isolate; waitUntil extends lifetime for bounded follow-up work but does not remove CPU limits.",
      rootCauseKey: "worker-cpu-bound-transform",
      solution:
        "Stream the upload to object storage or a queue and process the transform with an image-capable service; use waitUntil only for bounded follow-up work.",
      verification: [
        "The request returned within the Worker CPU budget and the queued transform produced the expected derivative image.",
      ],
      fingerprints: [
        "Cloudflare Workers CPU time exceeded",
        "Hono image upload",
        "waitUntil CPU limit",
      ],
      files: ["src/routes/upload.ts", "wrangler.toml", "src/queues/image.ts"],
      commands: ["pnpm wrangler dev", "pnpm wrangler tail"],
      errors: ["CPU time exceeded", "Worker exceeded resource limits"],
      tags: ["cloudflare-workers", "hono", "uploads", "queues"],
    },
    {
      key: "worker-memory-upload",
      problem:
        "The Worker hits memory limits while streaming a large upload without image transforms.",
      rootCause:
        "The request buffers the full body in memory; CPU scheduling is not the bottleneck.",
      solution:
        "Stream the request directly to object storage with bounded chunks and reject oversized payloads before buffering; do not add a queue only to fix memory pressure.",
      verification: [
        "A large upload stayed below the memory budget and the object was complete in storage.",
      ],
      fingerprints: ["Cloudflare Worker memory upload", "stream request to R2"],
    },
    {
      problem: "No useful Worker memory applies to a missing KV namespace binding.",
      error: "KV namespace binding is undefined",
    },
  ),
  defineFamily(
    {
      id: "lambda-node-esm-package",
      stratum: "cloud-runtimes",
      title: "AWS Lambda Node ESM deployment cannot resolve a package",
      packageName: "aws-lambda",
      versions: { node: "20.x", esbuild: "0.24.x", "aws-sdk": "3.x" },
      runtime: "AWS Lambda Node.js 20",
      toolchain: "esbuild",
      packageManager: "pnpm 11.x",
      os: "Amazon Linux",
      architecture: "x64",
      platforms: ["aws-lambda", "node"],
      commitRange: "main..bc19a2e",
      problem:
        "A Lambda function works in the workspace but production reports ERR_MODULE_NOT_FOUND for a declared package.",
      rootCause:
        "The deployment artifact omitted a workspace dependency or emitted a CommonJS/ESM entrypoint that does not match the Lambda package type.",
      rootCauseKey: "lambda-artifact-module-edge",
      solution:
        "Declare the package dependency in the consuming workspace, configure esbuild for the Lambda module format, and inspect the final zip for the resolved entrypoint before publishing.",
      verification: [
        "The unpacked deployment artifact contained the package and the Lambda smoke invocation returned 200.",
      ],
      fingerprints: [
        "Lambda ERR_MODULE_NOT_FOUND",
        "Node 20 ESM deployment zip",
        "esbuild external dependency",
      ],
      files: ["infra/function.ts", "package.json", "serverless.yml"],
      commands: ["pnpm build", "unzip -l dist/function.zip", "aws lambda invoke"],
      errors: ["ERR_MODULE_NOT_FOUND", "Cannot find package in Lambda"],
      tags: ["aws-lambda", "node", "esm", "esbuild"],
    },
    {
      key: "lambda-env-secret",
      problem:
        "The Lambda package contains its dependencies but a provider SDK rejects the request.",
      rootCause: "The runtime secret or region is missing; the artifact module graph is healthy.",
      solution:
        "Set the secret and region through the Lambda runtime configuration and verify them without logging values; do not change bundler externals for a credentials error.",
      verification: [
        "The smoke invocation authenticated after the runtime configuration was updated.",
      ],
      fingerprints: ["Lambda SDK credentials missing", "Node Lambda region config"],
    },
    {
      problem: "No useful Lambda memory applies to a throttling alarm.",
      error: "Rate exceeded for Lambda concurrency",
    },
  ),
  defineFamily(
    {
      id: "vercel-edge-node-api",
      stratum: "cloud-runtimes",
      title: "Vercel Edge route imports a Node-only API",
      packageName: "next",
      versions: { next: "15.x", node: "20.x", vercel: "2026.x" },
      runtime: "Vercel Edge runtime",
      toolchain: "Next.js route handlers",
      packageManager: "pnpm 11.x",
      os: "managed-edge",
      architecture: "wasm32",
      platforms: ["vercel-edge", "nextjs"],
      commitRange: "main..09dce41",
      problem:
        "A Vercel Edge route fails at build or runtime after importing a Node-only crypto or filesystem API.",
      rootCause:
        "The Edge runtime does not provide the Node built-ins expected by the dependency, so the route's runtime target is incompatible.",
      rootCauseKey: "edge-node-api-mismatch",
      solution:
        "Use Web Crypto and Edge-compatible dependencies in the Edge route, or explicitly move the handler to the Node runtime when the API requires Node built-ins.",
      verification: [
        "The route passed an Edge deployment smoke test with Web Crypto and a separate Node route retained filesystem access.",
      ],
      fingerprints: [
        "Vercel Edge node:crypto",
        "Next.js Edge runtime",
        "Edge-compatible Web Crypto",
      ],
      files: ["app/api/sign/route.ts", "next.config.ts", "package.json"],
      commands: ["pnpm next build", "pnpm vercel build"],
      errors: ["Node.js module is not supported in the Edge Runtime", "process is not defined"],
      tags: ["vercel", "edge", "nextjs", "webcrypto"],
    },
    {
      key: "edge-request-body",
      problem: "The Edge route has the correct APIs but reads the request body twice.",
      rootCause:
        "The Web Fetch request body is a one-shot stream; the runtime target is supported.",
      solution:
        "Read request.text or clone the request once before parsing and pass the captured value through verification; do not move the route to Node for a stream-lifecycle bug.",
      verification: ["The signature check and JSON parse both succeeded after one body read."],
      fingerprints: ["Edge request body used", "Fetch request stream twice"],
    },
    {
      problem: "No stored Edge memory applies to a CDN cache purge delay.",
      error: "Vercel cache purge pending",
    },
  ),
  defineFamily(
    {
      id: "flyio-healthcheck-bind",
      stratum: "cloud-runtimes",
      title: "Fly.io health checks cannot reach a Node service",
      packageName: "@flydotio/dockerfile",
      versions: { node: "20.x", flyctl: "0.2x", docker: "27.x" },
      runtime: "Fly.io VM",
      toolchain: "Docker",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "x64",
      platforms: ["flyio", "docker"],
      commitRange: "main..5a7d2f0",
      problem:
        "A Fly.io app is running but the platform health check reports connection refused on the service port.",
      rootCause:
        "The Node server listens on 127.0.0.1 inside the VM instead of 0.0.0.0, so Fly's private interface cannot reach it.",
      rootCauseKey: "flyio-bind-all-interfaces",
      solution:
        "Bind the HTTP server to 0.0.0.0, keep the internal_port aligned with the listener, and verify the health check path from inside the deployed VM.",
      verification: [
        "fly status showed healthy checks and curl to the internal port succeeded from the VM network namespace.",
      ],
      fingerprints: [
        "Fly.io health check connection refused",
        "Node bind 0.0.0.0",
        "internal_port",
      ],
      files: ["src/server.ts", "fly.toml", "Dockerfile"],
      commands: ["pnpm start --host 0.0.0.0", "fly deploy", "fly checks list"],
      errors: ["health check connection refused", "Fly app unhealthy"],
      tags: ["flyio", "docker", "node", "healthchecks"],
    },
    {
      key: "flyio-health-path",
      problem: "Fly can reach the service but the health check returns 404.",
      rootCause:
        "The configured health path does not match the route; binding and port wiring are correct.",
      solution:
        "Expose the configured health path as a cheap unauthenticated endpoint and update fly.toml only if the route contract intentionally changed.",
      verification: ["The health check returned 200 without requiring application authentication."],
      fingerprints: ["Fly.io health check 404", "fly.toml health path"],
    },
    {
      problem: "No useful Fly.io memory applies to a failed machine image pull.",
      error: "pull access denied for private image",
    },
  ),
  defineFamily(
    {
      id: "deno-import-map-worker",
      stratum: "cloud-runtimes",
      title: "Deno deploy cannot resolve an import map alias",
      packageName: "deno",
      versions: { deno: "1.46.x", typescript: "5.7.x" },
      runtime: "Deno Deploy",
      toolchain: "Deno import maps",
      packageManager: "deno",
      os: "managed-edge",
      architecture: "x64",
      platforms: ["deno", "edge"],
      commitRange: "main..d44fb09",
      problem:
        "A Deno Deploy function resolves relative imports locally but fails to resolve an alias from deno.json in production.",
      rootCause:
        "The deployment command is not using the same deno.json import map as local execution, so the alias is absent from the deployed module graph.",
      rootCauseKey: "deno-import-map-selection",
      solution:
        "Place the import map in the deployment root, pass the same config to the deploy command, and verify the resolved graph with deno info before publishing.",
      verification: [
        "deno info showed the alias target and the deployed function loaded it without a remote bare-specifier lookup.",
      ],
      fingerprints: ["Deno import map alias", "deno info", "Deno Deploy module graph"],
      files: ["deno.json", "src/main.ts", "deploy.ts"],
      commands: ["deno info src/main.ts", "deployctl deploy src/main.ts"],
      errors: ["Relative import path not prefixed with ./ or ../", "Module not found import map"],
      tags: ["deno", "import-maps", "edge", "typescript"],
    },
    {
      key: "deno-permission",
      problem:
        "The import alias resolves but the deployed function cannot read a file during startup.",
      rootCause: "Deno permissions are denied in the runtime; the import map is already active.",
      solution:
        "Move static data into the deployment bundle or request the narrow required permission where supported; do not rewrite import-map entries for a permission error.",
      verification: [
        "The function started with the least-privilege permission set and loaded its bundled data.",
      ],
      fingerprints: ["Deno permission denied read", "Deploy import map resolves"],
    },
    {
      problem: "No useful Deno memory applies to a WebSocket close code.",
      error: "Deno WebSocket closed 1006",
    },
  ),
  defineFamily(
    {
      id: "uv-pytorch-cuda-wheel",
      stratum: "python-ml-tooling",
      title: "uv selects a CPU PyTorch wheel in a CUDA environment",
      packageName: "torch",
      versions: { python: "3.12.x", torch: "2.5.x", uv: "0.5.x", cuda: "12.4" },
      runtime: "Python 3.12",
      toolchain: "uv",
      packageManager: "uv",
      os: "Linux",
      architecture: "x86_64",
      platforms: ["cuda", "linux"],
      commitRange: "main..f69ac12",
      problem:
        "A uv-managed ML environment imports torch successfully but torch.cuda.is_available() is false on a CUDA host.",
      rootCause:
        "The lock resolved the default CPU wheel because the CUDA package index or explicit torch variant was not part of the project dependency configuration.",
      rootCauseKey: "uv-torch-cuda-index",
      solution:
        "Declare the CUDA-compatible torch variant and its package index in pyproject.toml, regenerate uv.lock, then verify the driver, CUDA runtime, and torch build metadata separately.",
      verification: [
        "uv run python -c 'import torch; print(torch.version.cuda, torch.cuda.is_available())' reported the expected CUDA build and device.",
      ],
      fingerprints: ["uv torch CUDA wheel", "torch.cuda.is_available false", "uv.lock CPU wheel"],
      files: ["pyproject.toml", "uv.lock", "scripts/check_cuda.py"],
      commands: ["uv lock", "uv sync", "uv run python scripts/check_cuda.py"],
      errors: ["CUDA is not available", "Found no NVIDIA driver"],
      tags: ["python", "uv", "pytorch", "cuda"],
    },
    {
      key: "cuda-driver-runtime",
      problem: "The CUDA wheel is present but the process cannot initialize the device.",
      rootCause:
        "The host NVIDIA driver or container device mapping is incompatible; dependency selection is correct.",
      solution:
        "Check nvidia-smi and container device passthrough, then align the host driver with the CUDA runtime; do not replace the locked torch wheel first.",
      verification: [
        "nvidia-smi and a minimal torch CUDA allocation succeeded after the driver/device mapping was repaired.",
      ],
      fingerprints: ["torch CUDA driver mismatch", "nvidia-smi container passthrough"],
    },
    {
      problem: "No useful ML memory applies to a tokenizer vocabulary mismatch.",
      error: "Token indices sequence length is longer than the specified maximum sequence length",
    },
  ),
  defineFamily(
    {
      id: "pandas-pyarrow-abi",
      stratum: "python-ml-tooling",
      title: "Pandas and PyArrow fail at an ABI boundary",
      packageName: "pyarrow",
      versions: { python: "3.12.x", pandas: "2.2.x", pyarrow: "17.x" },
      runtime: "Python 3.12",
      toolchain: "Python wheels",
      packageManager: "uv",
      os: "Linux",
      architecture: "x86_64",
      platforms: ["linux", "manylinux"],
      commitRange: "main..ca74d11",
      problem:
        "A pandas dataframe conversion crashes with an import or binary ABI error after a PyArrow upgrade.",
      rootCause:
        "The environment contains incompatible wheel versions or stale compiled extensions from a previous Python environment.",
      rootCauseKey: "pandas-pyarrow-wheel-abi",
      solution:
        "Resolve compatible pandas and PyArrow versions in one lockfile, recreate the environment instead of mixing site-packages, and verify import versions plus a small dataframe conversion.",
      verification: [
        "A clean uv sync imported both packages and converted a dataframe to an Arrow table without an ABI error.",
      ],
      fingerprints: [
        "pandas pyarrow ABI",
        "ArrowInvalid dataframe conversion",
        "binary incompatibility",
      ],
      files: ["pyproject.toml", "uv.lock", "tests/test_arrow.py"],
      commands: ["uv sync --reinstall", "uv run python tests/test_arrow.py"],
      errors: ["ImportError undefined symbol", "ArrowInvalid", "numpy ABI mismatch"],
      tags: ["python", "pandas", "pyarrow", "dependencies"],
    },
    {
      key: "arrow-schema",
      problem: "PyArrow imports but a nested dataframe column cannot be converted.",
      rootCause:
        "The dataframe has mixed Python values that violate the intended Arrow schema; this is data-shape validation, not a wheel ABI issue.",
      solution:
        "Normalize the column and declare an explicit Arrow schema before conversion; keep the compatible environment unchanged.",
      verification: ["The normalized dataframe converted with a stable nested schema."],
      fingerprints: ["PyArrow mixed types dataframe", "Arrow schema conversion"],
    },
    {
      problem: "No useful PyArrow memory applies to a missing parquet file.",
      error: "FileNotFoundError dataset.parquet",
    },
  ),
  defineFamily(
    {
      id: "pydantic-settings-env",
      stratum: "python-ml-tooling",
      title: "Pydantic Settings v2 does not load a nested environment value",
      packageName: "pydantic-settings",
      versions: { "pydantic-settings": "2.x", pydantic: "2.x", python: "3.12.x" },
      runtime: "Python 3.12",
      toolchain: "FastAPI settings",
      packageManager: "uv",
      os: "Linux",
      architecture: "x86_64",
      platforms: ["fastapi", "linux"],
      commitRange: "main..0b5ac73",
      problem:
        "Pydantic Settings v2 ignores a nested database environment variable and uses the default configuration.",
      rootCause:
        "The settings model lacks the configured env_nested_delimiter or uses a v1 BaseSettings import with v2 packages.",
      rootCauseKey: "pydantic-settings-nested-env",
      solution:
        "Import BaseSettings from pydantic-settings, configure model_config with the intended env_nested_delimiter, and instantiate settings once from the process environment.",
      verification: [
        "A test environment loaded the nested URL and rejected a missing required value with a clear validation error.",
      ],
      fingerprints: [
        "Pydantic Settings v2 nested env",
        "env_nested_delimiter",
        "BaseSettings pydantic-settings",
      ],
      files: ["app/settings.py", "pyproject.toml", "tests/test_settings.py"],
      commands: ["uv run pytest tests/test_settings.py", "uv run python -m app.settings"],
      errors: ["extra inputs are not permitted", "settings uses default database URL"],
      tags: ["python", "pydantic", "settings", "fastapi"],
    },
    {
      key: "pydantic-v1-model",
      problem: "Settings load but a response model raises a validation error for a legacy field.",
      rootCause:
        "A v1-style model validator or field alias is incompatible with the response data; environment parsing is already correct.",
      solution:
        "Update the model validator and aliases for Pydantic v2 and keep settings configuration separate from response model migration.",
      verification: [
        "The response model validated the legacy payload after the v2 validator was updated.",
      ],
      fingerprints: ["Pydantic v2 model_validator alias", "settings already loads"],
    },
    {
      problem: "No useful settings memory applies to a FastAPI 422 body shape.",
      error: "FastAPI 422 field required request body",
    },
  ),
  defineFamily(
    {
      id: "ruff-pytest-pythonpath",
      stratum: "python-ml-tooling",
      title: "Ruff and pytest disagree about a Python package root",
      packageName: "pytest",
      versions: { pytest: "8.x", ruff: "0.8.x", python: "3.12.x" },
      runtime: "Python 3.12",
      toolchain: "pytest and Ruff",
      packageManager: "uv",
      os: "Linux",
      architecture: "x86_64",
      platforms: ["linux", "ci"],
      commitRange: "main..19dc4e0",
      problem:
        "pytest imports fail from a src-layout project while Ruff formats and lints the same files successfully.",
      rootCause:
        "The package is not installed in the test environment and PYTHONPATH is masking a missing project package configuration.",
      rootCauseKey: "python-src-layout-install",
      solution:
        "Declare the project package and test extra in pyproject.toml, run uv sync, and execute pytest through uv run instead of relying on a shell PYTHONPATH shortcut.",
      verification: [
        "uv run pytest and uv run ruff check passed from a clean checkout without PYTHONPATH.",
      ],
      fingerprints: ["pytest src layout import", "uv run pytest", "Ruff Python path"],
      files: ["pyproject.toml", "src/app/__init__.py", "tests/conftest.py"],
      commands: ["uv sync", "uv run pytest", "uv run ruff check ."],
      errors: ["ModuleNotFoundError src layout", "pytest import failed"],
      tags: ["python", "pytest", "ruff", "uv"],
    },
    {
      key: "pytest-fixture-path",
      problem: "The package imports but a fixture file is missing only under pytest.",
      rootCause:
        "The fixture path is relative to the current working directory rather than the test module, not a package installation problem.",
      solution:
        "Resolve fixture files from the module path with pathlib and keep package installation as the separate import boundary.",
      verification: [
        "The fixture test passed from the repository root and from a nested working directory.",
      ],
      fingerprints: ["pytest fixture relative path", "pathlib __file__ test"],
    },
    {
      problem: "No useful Python tooling memory applies to a mypy protocol variance error.",
      error: "mypy incompatible type protocol variance",
    },
  ),
  defineFamily(
    {
      id: "transformers-tokenizer-padding",
      stratum: "python-ml-tooling",
      title: "Transformers tokenizer batching fails without a padding token",
      packageName: "transformers",
      versions: { transformers: "4.47.x", torch: "2.5.x", python: "3.12.x" },
      runtime: "Python 3.12",
      toolchain: "Hugging Face Transformers",
      packageManager: "uv",
      os: "Linux",
      architecture: "x86_64",
      platforms: ["pytorch", "linux"],
      commitRange: "main..8a0cf11",
      problem:
        "A Transformers text-generation batch raises a padding token error even though single prompts work.",
      rootCause:
        "The tokenizer has no pad_token configured and the batch collator cannot create equal-length input tensors.",
      rootCauseKey: "transformers-padding-token",
      solution:
        "Set an appropriate pad_token, configure padding and truncation deliberately, and verify the model's attention-mask behavior on a small batch before scaling inference.",
      verification: [
        "A two-prompt batch produced tensors with a stable attention mask and generated outputs.",
      ],
      fingerprints: [
        "Transformers tokenizer pad_token",
        "batch generation padding",
        "attention mask",
      ],
      files: ["src/inference.py", "tests/test_batch.py", "pyproject.toml"],
      commands: ["uv run pytest tests/test_batch.py", "uv run python src/inference.py"],
      errors: [
        "Asking to pad but the tokenizer does not have a padding token",
        "stack expects each tensor",
      ],
      tags: ["python", "transformers", "pytorch", "ml"],
    },
    {
      key: "transformers-context-length",
      problem: "Batched generation has a padding token but truncates the prompt unexpectedly.",
      rootCause:
        "The prompt exceeds the model context window; padding configuration is not the capacity problem.",
      solution:
        "Measure tokenized length, truncate or chunk to the model context limit, and preserve the required prompt prefix before batching.",
      verification: [
        "Long prompts were bounded to the model context and the generated output retained the required instruction.",
      ],
      fingerprints: ["Transformers max position embeddings", "prompt truncation context length"],
    },
    {
      problem: "No useful Transformers memory applies to a missing model file checksum.",
      error: "OSError can't load model from local path",
    },
  ),
  defineFamily(
    {
      id: "github-actions-pnpm-cache",
      stratum: "ci-os-devtools",
      title: "GitHub Actions pnpm cache restores the wrong store",
      packageName: "pnpm",
      versions: { pnpm: "11.x", node: "22.x", "github-actions": "v4" },
      runtime: "GitHub Actions runner",
      toolchain: "actions/setup-node",
      packageManager: "pnpm 11.x",
      os: "Ubuntu 24.04",
      architecture: "x64",
      platforms: ["github-actions", "linux"],
      commitRange: "main..2ab7e15",
      problem:
        "A GitHub Actions job restores a pnpm cache but still performs a full install or uses stale packages.",
      rootCause:
        "The cache key is not derived from the lockfile and the workflow enables a different pnpm version or store directory than the cached path.",
      rootCauseKey: "github-pnpm-store-key",
      solution:
        "Pin pnpm, use pnpm config get store-dir for the cache path, and key the cache on the lockfile hash; run pnpm install --frozen-lockfile after restoring it.",
      verification: [
        "Two workflow runs restored the same lockfile-keyed store and the second install skipped package downloads.",
      ],
      fingerprints: ["GitHub Actions pnpm cache", "pnpm store-dir cache key", "frozen-lockfile"],
      files: [".github/workflows/ci.yml", "package.json", "pnpm-lock.yaml"],
      commands: ["pnpm config get store-dir", "pnpm install --frozen-lockfile"],
      errors: ["ERR_PNPM_OUTDATED_LOCKFILE", "pnpm cache miss"],
      tags: ["github-actions", "pnpm", "cache", "ci"],
    },
    {
      key: "github-cache-corruption",
      problem: "The cached store is restored but a package archive is corrupt.",
      rootCause:
        "The cache artifact itself is incomplete or was produced by an interrupted install; the cache key is otherwise correct.",
      solution:
        "Invalidate the corrupt cache key and rebuild the store from the lockfile; keep the lockfile-derived key and pinned pnpm version.",
      verification: [
        "A cache miss followed by a clean install produced a valid store and subsequent restore succeeded.",
      ],
      fingerprints: ["pnpm cache corrupt archive", "GitHub Actions cache invalidation"],
    },
    {
      problem: "No useful CI cache memory applies to a cancelled workflow job.",
      error: "The job was cancelled by the runner",
    },
  ),
  defineFamily(
    {
      id: "node-eaddrinuse-timewait",
      stratum: "ci-os-devtools",
      title: "CI reports EADDRINUSE after the old server exits",
      packageName: "node",
      versions: { node: "22.x", "github-actions": "v4", linux: "6.x" },
      runtime: "Node.js CI process",
      toolchain: "Playwright webServer",
      packageManager: "pnpm 11.x",
      os: "Ubuntu 24.04",
      architecture: "x64",
      platforms: ["github-actions", "linux"],
      commitRange: "main..c4f09be",
      problem:
        "A CI web server intermittently fails with EADDRINUSE even though the previous process was killed and no listener owns the fixed port.",
      rootCause:
        "A fixed port can remain unavailable during socket teardown or a parallel job can race for it; kill-port loops do not make startup deterministic.",
      rootCauseKey: "eaddrinuse-timewait-fixed-port",
      solution:
        "Bind the CI server to port 0 and pass the selected port to the test runner; if a fixed port is unavoidable, add graceful shutdown and readiness checks instead of repeated kill-port commands.",
      verification: [
        "Repeated CI runs used a dynamically selected port and completed without EADDRINUSE.",
      ],
      fingerprints: ["EADDRINUSE CI", "port 0 Playwright webServer", "TIME_WAIT"],
      files: ["playwright.config.ts", "scripts/start-test-server.ts", ".github/workflows/ci.yml"],
      commands: ["pnpm exec playwright test", "node scripts/start-test-server.ts"],
      errors: ["EADDRINUSE", "listen address already in use"],
      tags: ["node", "ci", "github-actions", "ports"],
    },
    {
      key: "eaddrinuse-live-process",
      problem: "A local development server is genuinely still listening on the configured port.",
      rootCause:
        "A parent process or separate workspace owns the port; this is not a TIME_WAIT teardown race.",
      solution:
        "Identify the owning process with a port inspection command and stop the correct process or choose a different development port; retain dynamic allocation for parallel CI.",
      verification: [
        "The owner was identified and the server started after the live process exited.",
      ],
      fingerprints: ["EADDRINUSE live listener", "lsof port node process"],
    },
    {
      problem: "No useful port memory applies to a DNS lookup failure.",
      error: "getaddrinfo ENOTFOUND test-service",
    },
  ),
  defineFamily(
    {
      id: "docker-buildx-arm64-platform",
      stratum: "ci-os-devtools",
      title: "Docker Buildx produces an image for the wrong architecture",
      packageName: "docker buildx",
      versions: { docker: "27.x", buildx: "0.18.x", node: "20.x" },
      runtime: "Docker Buildx",
      toolchain: "Docker multi-platform build",
      packageManager: "pnpm 11.x",
      os: "Linux",
      architecture: "arm64",
      platforms: ["docker", "linux", "arm64"],
      commitRange: "main..e61c2b7",
      problem:
        "An ARM64 deployment pulls an image built on x64 and fails with an exec format error.",
      rootCause:
        "The build did not declare or publish the linux/arm64 platform, so the registry tag points to an x64-only manifest.",
      rootCauseKey: "docker-buildx-platform-manifest",
      solution:
        "Build and push with docker buildx --platform linux/amd64,linux/arm64 and inspect the manifest list before deployment; use emulation or native builders consistently.",
      verification: [
        "docker buildx imagetools inspect showed both platforms and the ARM64 runtime started successfully.",
      ],
      fingerprints: ["Docker exec format error arm64", "buildx --platform", "multi-arch manifest"],
      files: ["Dockerfile", ".github/workflows/build.yml", "docker-bake.hcl"],
      commands: [
        "docker buildx build --platform linux/amd64,linux/arm64 --push .",
        "docker buildx imagetools inspect image:tag",
      ],
      errors: ["exec format error", "no matching manifest for linux/arm64"],
      tags: ["docker", "buildx", "arm64", "containers"],
    },
    {
      key: "docker-musl-glibc",
      problem: "The ARM64 image has the correct platform but a native module fails to load.",
      rootCause:
        "The image uses musl while the native module expects glibc; platform selection is correct.",
      solution:
        "Use a compatible base image or rebuild the native module for musl and keep the multi-platform manifest unchanged.",
      verification: ["The native module loaded in the selected base image on ARM64."],
      fingerprints: ["Docker arm64 native module musl glibc", "ELF interpreter missing"],
    },
    {
      problem: "No useful Docker memory applies to a registry rate limit.",
      error: "toomanyrequests Docker Hub rate limit",
    },
  ),
  defineFamily(
    {
      id: "systemd-user-environment",
      stratum: "ci-os-devtools",
      title: "A systemd user service cannot see the interactive environment",
      packageName: "systemd",
      versions: { systemd: "256.x", linux: "6.x" },
      runtime: "systemd --user",
      toolchain: "Linux user services",
      packageManager: "pacman",
      os: "Arch Linux",
      architecture: "x64",
      platforms: ["linux", "systemd-user"],
      commitRange: "main..0fe6d31",
      problem:
        "A systemd --user service starts but cannot find a tool or session variable available in the shell.",
      rootCause:
        "User services do not source interactive shell startup files and may start before the graphical session exports the required environment.",
      rootCauseKey: "systemd-user-environment",
      solution:
        "Declare the required environment and absolute executable path in the user unit or an EnvironmentFile, reload the user manager, and use systemctl --user import-environment only for session-owned values.",
      verification: [
        "systemctl --user show-environment and journalctl for the unit showed the expected variable and executable path after daemon-reload.",
      ],
      fingerprints: [
        "systemd --user environment",
        "user service PATH",
        "daemon-reload import-environment",
      ],
      files: ["~/.config/systemd/user/example.service", "~/.config/environment.d/example.conf"],
      commands: [
        "systemctl --user daemon-reload",
        "systemctl --user restart example.service",
        "journalctl --user -u example.service",
      ],
      errors: [
        "command not found systemd user service",
        "environment variable missing in user unit",
      ],
      tags: ["systemd", "linux", "user-services", "environment"],
    },
    {
      key: "systemd-user-ordering",
      problem:
        "The user service sees its environment but starts before a socket or desktop session is ready.",
      rootCause:
        "The unit ordering and readiness dependency are wrong; shell environment is already present.",
      solution:
        "Add the appropriate After/Wants dependency or a readiness check with bounded retry; do not copy interactive shell startup files into the unit.",
      verification: [
        "The service started after its socket dependency and recovered across a login restart.",
      ],
      fingerprints: ["systemd user service ordering", "After Wants socket readiness"],
    },
    {
      problem: "No useful systemd memory applies to an unrelated kernel module failure.",
      error: "modprobe failed to load kernel module",
    },
  ),
  defineFamily(
    {
      id: "git-lfs-ci-smudge",
      stratum: "ci-os-devtools",
      title: "Git LFS checkout fails in a clean CI runner",
      packageName: "git-lfs",
      versions: { "git-lfs": "3.6.x", git: "2.47.x", "github-actions": "v4" },
      runtime: "GitHub Actions runner",
      toolchain: "Git LFS",
      packageManager: "pnpm 11.x",
      os: "Ubuntu 24.04",
      architecture: "x64",
      platforms: ["github-actions", "git-lfs"],
      commitRange: "main..b71e2c8",
      problem:
        "A CI checkout leaves LFS pointer files instead of the binary assets required by the test.",
      rootCause:
        "Git LFS is not installed or the checkout action skips LFS fetch/smudge, so the repository contains pointer metadata only.",
      rootCauseKey: "git-lfs-ci-checkout",
      solution:
        "Install Git LFS before checkout or enable the checkout action's LFS option, then verify an expected asset is no longer a versioned pointer file.",
      verification: [
        "The CI asset began with the binary magic bytes and the fixture test passed after an LFS-enabled checkout.",
      ],
      fingerprints: ["Git LFS pointer file CI", "actions checkout lfs true", "git lfs pull"],
      files: [".github/workflows/ci.yml", ".gitattributes", "tests/fixtures/"],
      commands: ["git lfs install", "git lfs pull", "git lfs ls-files"],
      errors: ["version https://git-lfs.github.com/spec/v1", "LFS object missing"],
      tags: ["git-lfs", "github-actions", "ci", "assets"],
    },
    {
      key: "git-lfs-pointer-corrupt",
      problem: "Git LFS is enabled but one asset remains a pointer after a partial fetch.",
      rootCause:
        "The LFS object is missing from the configured remote or the fetch was interrupted; checkout configuration is correct.",
      solution:
        "Fetch the object from the correct LFS remote and verify it with git lfs fsck; do not change smudge settings to hide a missing object.",
      verification: [
        "git lfs fsck found no missing object and the asset content matched its pointer hash.",
      ],
      fingerprints: ["git lfs fsck missing object", "LFS partial fetch"],
    },
    {
      problem: "No useful Git memory applies to a non-fast-forward push rejection.",
      error: "rejected non-fast-forward git push",
    },
  ),
];

if (familyDefinitions.length !== 30) {
  throw new Error(`Memory benchmark must define 30 families, found ${familyDefinitions.length}`);
}
