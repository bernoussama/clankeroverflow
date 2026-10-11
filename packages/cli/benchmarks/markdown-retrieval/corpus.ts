import type {
  BenchmarkCategory,
  BenchmarkCorpus,
  BenchmarkDocument,
  BenchmarkLanguage,
  BenchmarkQuery,
} from "./types";

type Issue = [id: string, problem: string, solution: string];
type Topic = {
  id: string;
  tags: string;
  issues: [Issue, Issue, Issue, Issue];
  queries: [string, string];
};

const topics: Topic[] = [
  {
    id: "vite-ports",
    tags: "vite,dev-server,ports",
    issues: [
      [
        "occupied",
        "Vite exits with EADDRINUSE on port 5173",
        "Stop the process holding port 5173 or start Vite with --port on a free port.",
      ],
      [
        "host",
        "Vite dev server is unreachable from a container",
        "Bind Vite to 0.0.0.0 with --host and publish the configured port.",
      ],
      [
        "strict",
        "Vite silently selects another port",
        "Enable server.strictPort so startup fails instead of incrementing an occupied port.",
      ],
      [
        "proxy",
        "Vite API proxy returns ECONNREFUSED",
        "Point the proxy target at the service address reachable from the Vite process.",
      ],
    ],
    queries: ["EADDRINUSE 5173", "Vite unreachable container host"],
  },
  {
    id: "playwright-browser",
    tags: "playwright,ci,browser",
    issues: [
      [
        "missing",
        "Playwright Chromium executable is missing in CI",
        "Run playwright install --with-deps chromium after installing package dependencies.",
      ],
      [
        "sandbox",
        "Chromium fails with No usable sandbox in a container",
        "Use Playwright's supported container image or configure the container sandbox instead of disabling it blindly.",
      ],
      [
        "display",
        "Headed Playwright test cannot open a display",
        "Run the test headless or launch it under Xvfb when headed rendering is required.",
      ],
      [
        "version",
        "Playwright Docker browser version does not match",
        "Pin the image tag to the installed Playwright package version.",
      ],
    ],
    queries: ["Playwright Chromium executable missing CI", "Chromium No usable sandbox container"],
  },
  {
    id: "prisma-migrate",
    tags: "prisma,postgres,migrations",
    issues: [
      [
        "shadow",
        "Prisma migration shadow database permission denied",
        "Grant CREATEDB to the development role or configure a dedicated shadowDatabaseUrl.",
      ],
      [
        "drift",
        "Prisma reports schema drift after a manual database change",
        "Create a migration matching the manual change or resolve the migration history before continuing.",
      ],
      [
        "lock",
        "Prisma migrate deploy waits on an advisory lock",
        "Find the concurrent migration process and serialize deploy migrations.",
      ],
      [
        "baseline",
        "Prisma wants to recreate an existing production schema",
        "Baseline the existing schema with migrate resolve before deploying new migrations.",
      ],
    ],
    queries: [
      "Prisma shadow database permission denied",
      "Prisma schema drift manual database change",
    ],
  },
  {
    id: "next-cache",
    tags: "nextjs,cache,app-router",
    issues: [
      [
        "tag",
        "Next.js App Router data remains stale after a mutation",
        "Use the same cache tag on the read and call revalidateTag after the successful mutation.",
      ],
      [
        "path",
        "A Next.js route stays cached after updating its record",
        "Call revalidatePath for the affected route from the server mutation.",
      ],
      [
        "dynamic",
        "A Next.js page is unexpectedly rendered dynamically",
        "Remove request-time APIs from the static path or explicitly choose the intended dynamic mode.",
      ],
      [
        "router",
        "router.refresh does not invalidate server data cache",
        "Invalidate the server cache with revalidateTag or revalidatePath; refresh only requests a new payload.",
      ],
    ],
    queries: [
      "Next.js App Router data stale mutation revalidateTag",
      "Next.js route cached updating record revalidatePath",
    ],
  },
  {
    id: "react-hooks",
    tags: "react,hooks,state",
    issues: [
      [
        "loop",
        "React effect causes a maximum update depth loop",
        "Remove unstable dependencies or move the state update behind a condition that can settle.",
      ],
      [
        "stale",
        "React callback reads stale state",
        "Use a functional state update or include the value in the callback dependencies.",
      ],
      [
        "order",
        "React reports a change in the order of Hooks",
        "Call hooks unconditionally at the component top level before early returns.",
      ],
      [
        "strict",
        "React effect runs twice during development",
        "Make the effect idempotent; Strict Mode intentionally remounts effects in development.",
      ],
    ],
    queries: [
      "React effect maximum update depth loop",
      "React callback stale state functional update",
    ],
  },
  {
    id: "typescript-resolution",
    tags: "typescript,modules,types",
    issues: [
      [
        "exports",
        "TypeScript cannot resolve a package subpath",
        "Expose the subpath and matching types in the package exports map.",
      ],
      [
        "esm",
        "TypeScript NodeNext requires explicit relative extensions",
        "Use the emitted .js extension in relative ESM imports.",
      ],
      [
        "ambient",
        "TypeScript cannot find declarations for an untyped module",
        "Install its type package or add a narrow ambient module declaration.",
      ],
      [
        "paths",
        "TypeScript paths work in the editor but fail at runtime",
        "Configure the runtime bundler or loader with the same alias; tsconfig paths do not rewrite imports.",
      ],
    ],
    queries: [
      "TypeScript package subpath exports types",
      "TypeScript NodeNext relative extensions emitted js",
    ],
  },
  {
    id: "pnpm-lockfile",
    tags: "pnpm,lockfile,workspace",
    issues: [
      [
        "frozen",
        "pnpm install fails because the lockfile is frozen",
        "Run pnpm install locally after manifest changes and commit the updated pnpm-lock.yaml.",
      ],
      [
        "workspace",
        "pnpm cannot resolve a workspace package",
        "Add the package to pnpm-workspace.yaml and use a workspace: dependency range.",
      ],
      [
        "peers",
        "pnpm reports an unmet peer dependency",
        "Align the peer version at the consuming workspace rather than adding a duplicate transitive copy.",
      ],
      [
        "store",
        "pnpm store metadata is corrupted",
        "Run pnpm store prune and reinstall; remove only the affected store when corruption persists.",
      ],
    ],
    queries: ["pnpm lockfile frozen manifest changes", "pnpm workspace package dependency range"],
  },
  {
    id: "docker-build",
    tags: "docker,buildkit,containers",
    issues: [
      [
        "context",
        "Docker build cannot copy a file outside its context",
        "Choose a build context containing the file and adjust COPY paths relative to that context.",
      ],
      [
        "cache",
        "Docker build keeps reusing a stale dependency layer",
        "Copy lockfiles before install and invalidate the layer when dependency inputs change.",
      ],
      [
        "platform",
        "Docker image has the wrong CPU architecture",
        "Build with the target --platform or publish a multi-platform image with buildx.",
      ],
      [
        "secret",
        "A build secret is persisted in a Docker layer",
        "Use a BuildKit secret mount and consume it in the same RUN instruction.",
      ],
    ],
    queries: ["Docker COPY file outside build context", "Docker build stale dependency layer"],
  },
  {
    id: "postgres-index",
    tags: "postgres,index,query-performance",
    issues: [
      [
        "expression",
        "Postgres ignores an index when a column is wrapped in lower",
        "Create a matching expression index or compare against the stored normalized value.",
      ],
      [
        "partial",
        "Postgres does not use a partial index",
        "Make the query predicate imply the partial-index predicate exactly.",
      ],
      [
        "stats",
        "Postgres chooses a bad plan after a large data change",
        "Run ANALYZE and raise statistics targets for skewed columns when necessary.",
      ],
      [
        "cast",
        "Postgres performs a sequential scan because of a type cast",
        "Align parameter and column types so the indexed column is not cast during comparison.",
      ],
    ],
    queries: ["Postgres index column lower expression", "Postgres partial index query predicate"],
  },
  {
    id: "redis-memory",
    tags: "redis,memory,cache",
    issues: [
      [
        "oom",
        "Redis rejects writes with OOM command not allowed",
        "Set an appropriate maxmemory policy or free memory after confirming persistence requirements.",
      ],
      [
        "ttl",
        "Redis cache keys never expire",
        "Set the TTL atomically with the write and verify later writes do not remove it.",
      ],
      [
        "eviction",
        "Redis evicts hot keys unexpectedly",
        "Choose an eviction policy matching the workload and size maxmemory with headroom.",
      ],
      [
        "fork",
        "Redis background save fails despite apparent free memory",
        "Reserve memory for copy-on-write during fork and inspect host overcommit settings.",
      ],
    ],
    queries: ["Redis OOM command maxmemory writes", "Redis cache keys never expire TTL write"],
  },
  {
    id: "actions-permissions",
    tags: "github-actions,ci,permissions",
    issues: [
      [
        "contents",
        "GitHub Actions cannot push with resource not accessible",
        "Grant contents: write to the job and ensure fork pull requests are not given write tokens.",
      ],
      [
        "oidc",
        "GitHub Actions cannot request an OIDC token",
        "Grant id-token: write and configure the cloud trust subject for the repository and ref.",
      ],
      [
        "cache",
        "GitHub Actions cache is never restored",
        "Keep the cache key stable and use restore-keys for compatible fallback entries.",
      ],
      [
        "matrix",
        "One GitHub Actions matrix failure cancels every job",
        "Set fail-fast: false when independent matrix results must all complete.",
      ],
    ],
    queries: [
      "GITHUB_TOKEN resource not accessible by integration push",
      "workflow unable to get ACTIONS_ID_TOKEN_REQUEST_URL",
    ],
  },
  {
    id: "node-esm",
    tags: "nodejs,esm,modules",
    issues: [
      [
        "require",
        "Node throws require is not defined in ES module scope",
        "Replace require with import or use createRequire for a dependency that must remain CommonJS.",
      ],
      [
        "dirname",
        "__dirname is undefined in a Node ES module",
        "Derive it from fileURLToPath(import.meta.url).",
      ],
      [
        "extension",
        "Node ESM cannot find a relative module",
        "Include the emitted file extension in the relative import.",
      ],
      [
        "interop",
        "A CommonJS package has no named export in Node ESM",
        "Import the default CommonJS namespace and read the property from it.",
      ],
    ],
    queries: [
      "require is not defined type module",
      "how to get current module directory without __dirname",
    ],
  },
  {
    id: "workers-limits",
    tags: "cloudflare,workers,runtime",
    issues: [
      [
        "cpu",
        "Cloudflare Worker exceeds CPU time",
        "Move blocking work out of the request, batch operations, and use waitUntil only for allowed background work.",
      ],
      [
        "subrequest",
        "Cloudflare Worker exceeds the subrequest limit",
        "Batch upstream calls and eliminate request-per-row patterns.",
      ],
      [
        "node",
        "A Node package fails in the Workers runtime",
        "Use a web-standard alternative or enable nodejs_compat only when the package APIs are supported.",
      ],
      [
        "body",
        "Cloudflare Worker throws body used already",
        "Clone the response or consume its body only once before constructing the returned response.",
      ],
    ],
    queries: ["worker exceeded CPU time limit", "too many subrequests cloudflare loop"],
  },
  {
    id: "vitest-mocks",
    tags: "vitest,testing,mocks",
    issues: [
      [
        "hoist",
        "Vitest mock factory references a variable before initialization",
        "Declare shared mock values with vi.hoisted or construct them inside the hoisted factory.",
      ],
      [
        "restore",
        "A Vitest spy leaks into another test",
        "Restore mocks in afterEach or enable restoreMocks in configuration.",
      ],
      [
        "timer",
        "Vitest fake-timer test never settles",
        "Advance timers and flush pending promises before awaiting the final assertion.",
      ],
      [
        "esm",
        "Vitest cannot mock an ESM dependency",
        "Call vi.mock before importing the module under test and avoid destructuring a cached binding too early.",
      ],
    ],
    queries: [
      "vitest cannot access before initialization vi.mock",
      "mock implementation remains in next test",
    ],
  },
  {
    id: "tailwind-scan",
    tags: "tailwind,css,content",
    issues: [
      [
        "dynamic",
        "Tailwind omits dynamically constructed class names",
        "Map variants to complete static class strings or safelist the finite set.",
      ],
      [
        "content",
        "Tailwind styles are missing for a workspace package",
        "Add the package source files to the content/source scan configuration.",
      ],
      [
        "important",
        "Tailwind utility loses to component CSS specificity",
        "Fix cascade ordering or use the configured important strategy sparingly.",
      ],
      [
        "plugin",
        "A Tailwind plugin utility is not generated",
        "Register the plugin in the active configuration and ensure matching classes are scanned.",
      ],
    ],
    queries: [
      "tailwind bg-${color} not generated",
      "monorepo component classes absent from tailwind output",
    ],
  },
  {
    id: "eslint-flat",
    tags: "eslint,lint,configuration",
    issues: [
      [
        "ignore",
        "ESLint flat config ignores do not apply",
        "Put global ignore patterns in a config object containing only ignores.",
      ],
      [
        "parser",
        "ESLint cannot parse TypeScript syntax",
        "Configure the TypeScript parser and matching file globs in the flat config.",
      ],
      [
        "plugin",
        "ESLint cannot find a rule from a flat-config plugin",
        "Register the plugin object under the same namespace used by the rule key.",
      ],
      [
        "type",
        "Type-aware ESLint rules cannot find the project",
        "Point parserOptions.projectService at a tsconfig that includes the linted file.",
      ],
    ],
    queries: [
      "eslint.config ignores node_modules still linted",
      "typescript parsing error eslint flat config",
    ],
  },
  {
    id: "turbo-cache",
    tags: "turborepo,cache,monorepo",
    issues: [
      [
        "env",
        "Turborepo reuses output after an environment change",
        "Declare the relevant environment variable in env or globalEnv so it contributes to the hash.",
      ],
      [
        "outputs",
        "Turborepo task runs but restores no build files",
        "Declare every generated directory in the task outputs and exclude transient caches.",
      ],
      [
        "depends",
        "Turborepo builds packages in the wrong order",
        "Use dependsOn with the caret form for dependency-package tasks.",
      ],
      [
        "input",
        "Turborepo cache misses on unrelated file changes",
        "Narrow task inputs and globalDependencies to files that truly affect the output.",
      ],
    ],
    queries: [
      "turbo cache ignores changed environment variable",
      "remote cache hit but dist directory missing",
    ],
  },
  {
    id: "drizzle-migrate",
    tags: "drizzle,sql,migrations",
    issues: [
      [
        "journal",
        "Drizzle migration exists but is not applied",
        "Keep the generated journal and SQL migration together and run the migrator against the intended database.",
      ],
      [
        "rename",
        "Drizzle generates drop and create for a renamed column",
        "Answer the rename prompt correctly or edit the generated migration before applying it.",
      ],
      [
        "schema",
        "Drizzle cannot find a table outside public schema",
        "Declare the PostgreSQL schema and reference the table through that schema object.",
      ],
      [
        "enum",
        "Drizzle enum migration fails because the type already exists",
        "Reconcile migration history and use an idempotent transition rather than recreating the enum.",
      ],
    ],
    queries: [
      "drizzle generate SQL file skipped by migrate",
      "column rename turned into destructive drop drizzle",
    ],
  },
  {
    id: "auth-cookies",
    tags: "better-auth,cookies,sessions",
    issues: [
      [
        "secure",
        "Authentication session cookie is absent on local HTTP",
        "Do not force Secure cookies for plain localhost HTTP, or serve local development over HTTPS.",
      ],
      [
        "origin",
        "Authentication rejects a valid frontend origin",
        "Add the exact scheme and host to trustedOrigins and avoid wildcard credential origins.",
      ],
      [
        "proxy",
        "Authentication callback uses an internal proxy URL",
        "Forward trusted host/proto headers and configure the public base URL.",
      ],
      [
        "same-site",
        "OAuth callback loses the login session cookie",
        "Use a SameSite policy compatible with the callback flow and keep the callback on the expected site.",
      ],
    ],
    queries: ["better auth cookie not set localhost", "invalid origin auth request trustedOrigins"],
  },
  {
    id: "stripe-webhooks",
    tags: "stripe,webhooks,payments",
    issues: [
      [
        "signature",
        "Stripe webhook signature verification fails",
        "Verify against the untouched raw request body and the endpoint's correct signing secret.",
      ],
      [
        "duplicate",
        "Stripe webhook processes an event twice",
        "Store the event id and make the handler idempotent before applying side effects.",
      ],
      [
        "order",
        "Stripe subscription events arrive out of order",
        "Read the current Stripe object or compare event timestamps instead of assuming delivery order.",
      ],
      [
        "timeout",
        "Stripe retries a webhook after the handler succeeds slowly",
        "Acknowledge quickly and enqueue durable processing for expensive work.",
      ],
    ],
    queries: [
      "No signatures found matching expected signature raw body",
      "same stripe event charged processing twice",
    ],
  },
  {
    id: "kubernetes-probes",
    tags: "kubernetes,health-checks,deployments",
    issues: [
      [
        "startup",
        "Kubernetes restarts a slow-starting pod before it is ready",
        "Add a startupProbe that gives initialization enough time before liveness begins.",
      ],
      [
        "liveness",
        "Kubernetes liveness probe causes cascading restarts",
        "Probe process health rather than overloaded dependencies and relax thresholds appropriately.",
      ],
      [
        "readiness",
        "A Kubernetes pod receives traffic before initialization",
        "Keep readiness failing until required local initialization is complete.",
      ],
      [
        "path",
        "Kubernetes HTTP probe returns 404",
        "Use the container's actual health path and port, not the external ingress path.",
      ],
    ],
    queries: [
      "pod killed during long startup probe",
      "liveness failures restart healthy overloaded service",
    ],
  },
  {
    id: "terraform-state",
    tags: "terraform,state,infrastructure",
    issues: [
      [
        "lock",
        "Terraform cannot acquire the remote state lock",
        "Confirm no apply is active, then release only the stale lock with force-unlock.",
      ],
      [
        "import",
        "Terraform plans to create an existing resource",
        "Import the resource at its exact configuration address before applying.",
      ],
      [
        "move",
        "Terraform plans destroy and create after a refactor",
        "Add a moved block from the old address to the new address.",
      ],
      [
        "drift",
        "Terraform repeatedly changes a provider-managed field",
        "Stop setting the computed field or use lifecycle ignore_changes only for intentionally external ownership.",
      ],
    ],
    queries: [
      "Error acquiring state lock terraform",
      "resource exists outside terraform prevent duplicate creation",
    ],
  },
  {
    id: "nginx-proxy",
    tags: "nginx,reverse-proxy,http",
    issues: [
      [
        "websocket",
        "WebSocket connection through Nginx closes during upgrade",
        "Forward Upgrade and Connection headers with HTTP/1.1 to the upstream.",
      ],
      [
        "body",
        "Nginx returns 413 for file uploads",
        "Raise client_max_body_size at the applicable scope and keep upstream limits aligned.",
      ],
      [
        "host",
        "Application behind Nginx generates the wrong host URL",
        "Forward Host and the trusted X-Forwarded-* headers.",
      ],
      [
        "timeout",
        "Nginx returns 504 for a long upstream request",
        "Fix slow upstream work or adjust proxy timeouts when the long request is intentional.",
      ],
    ],
    queries: [
      "nginx websocket 101 upgrade not working",
      "413 Request Entity Too Large reverse proxy",
    ],
  },
  {
    id: "git-history",
    tags: "git,version-control,history",
    issues: [
      [
        "detached",
        "A commit was created on a detached HEAD",
        "Create a branch at the commit before switching away, then merge or cherry-pick it.",
      ],
      [
        "reflog",
        "A branch commit disappeared after reset",
        "Find the commit in git reflog and create a recovery branch at its hash.",
      ],
      [
        "large",
        "Git rejects a push containing a large historical file",
        "Remove the blob from history with filter-repo, then coordinate the rewritten push.",
      ],
      [
        "submodule",
        "Git submodule is checked out at the wrong revision",
        "Update the submodule checkout and commit the parent repository's gitlink change.",
      ],
    ],
    queries: ["recover commit made detached HEAD", "find commit lost after git reset hard"],
  },
  {
    id: "ssh-keys",
    tags: "ssh,authentication,linux",
    issues: [
      [
        "permission",
        "SSH ignores a private key because permissions are too open",
        "Restrict the private key and .ssh directory permissions to the owning user.",
      ],
      [
        "agent",
        "SSH offers the wrong key from an agent",
        "Set IdentitiesOnly and IdentityFile for the host or remove unrelated agent keys.",
      ],
      [
        "known",
        "SSH host key verification fails after a legitimate rebuild",
        "Verify the new fingerprint out of band, then replace the stale known_hosts entry.",
      ],
      [
        "forward",
        "SSH agent forwarding is unavailable on the remote host",
        "Enable forwarding only for the trusted host and confirm SSH_AUTH_SOCK is forwarded.",
      ],
    ],
    queries: [
      "UNPROTECTED PRIVATE KEY FILE ignored",
      "ssh too many authentication failures wrong agent keys",
    ],
  },
  {
    id: "python-env",
    tags: "python,venv,pip",
    issues: [
      [
        "interpreter",
        "Python installs a package but the script cannot import it",
        "Run pip through the same interpreter with python -m pip and activate the intended environment.",
      ],
      [
        "system",
        "pip refuses an externally managed environment",
        "Create a virtual environment instead of modifying the distribution-managed Python.",
      ],
      [
        "binary",
        "Python package build fails for a missing compiler",
        "Install a compatible wheel or the required compiler and native development headers.",
      ],
      [
        "path",
        "A shell uses global Python after activating a venv",
        "Inspect command hashing and PATH, then reactivate or invoke the environment interpreter directly.",
      ],
    ],
    queries: [
      "pip says installed ModuleNotFoundError different python",
      "externally-managed-environment pip install",
    ],
  },
  {
    id: "cargo-build",
    tags: "rust,cargo,toolchain",
    issues: [
      [
        "linker",
        "Cargo fails because linker cc is not found",
        "Install the platform C toolchain or configure the correct target linker.",
      ],
      [
        "openssl",
        "Rust openssl-sys cannot find OpenSSL",
        "Install matching development files or use the crate's vendored feature when appropriate.",
      ],
      [
        "feature",
        "Cargo dependency does not expose an expected API",
        "Enable the crate feature that gates the API and inspect feature unification.",
      ],
      [
        "target",
        "Rust binary fails with exec format error",
        "Build for the deployment target or run the cross-compiled artifact on the matching architecture.",
      ],
    ],
    queries: [
      "error linker cc not found cargo",
      "openssl-sys failed custom build command pkg-config",
    ],
  },
  {
    id: "go-modules",
    tags: "go,modules,dependencies",
    issues: [
      [
        "sum",
        "Go reports a missing go.sum entry",
        "Run go mod tidy or download the dependency and commit the resulting checksums.",
      ],
      [
        "private",
        "Go cannot fetch a private module",
        "Set GOPRIVATE and configure Git credentials without sending private paths to the public proxy.",
      ],
      [
        "replace",
        "A Go replace directive works locally but breaks CI",
        "Avoid an uncommitted relative replacement or provide the replaced module in the CI checkout.",
      ],
      [
        "version",
        "Go selects an unexpected transitive module version",
        "Use go mod graph and minimal version selection to find the dependency requiring it.",
      ],
    ],
    queries: [
      "missing go.sum entry for module",
      "go get private repository asks terminal prompts disabled",
    ],
  },
  {
    id: "gradle-cache",
    tags: "gradle,java,build",
    issues: [
      [
        "daemon",
        "Gradle daemon disappears during a build",
        "Inspect daemon logs and set a realistic JVM heap within the machine or container limit.",
      ],
      [
        "variant",
        "Gradle cannot choose between dependency variants",
        "Align requested attributes and publish an unambiguous consumable variant.",
      ],
      [
        "offline",
        "Gradle offline build cannot resolve a plugin",
        "Warm the plugin and dependency caches online or provide an internal mirror.",
      ],
      [
        "stale",
        "Gradle uses stale generated output",
        "Declare task inputs and outputs correctly, then invalidate the affected build cache entry.",
      ],
    ],
    queries: [
      "Gradle build daemon disappeared unexpectedly memory",
      "cannot choose between following variants gradle",
    ],
  },
  {
    id: "android-manifest",
    tags: "android,gradle,manifest",
    issues: [
      [
        "exported",
        "Android build requires android:exported",
        "Set android:exported explicitly on components with intent filters for Android 12 and later.",
      ],
      [
        "merge",
        "Android manifest merger reports conflicting attributes",
        "Find the contributing manifest and use a targeted tools:replace only when the app value should win.",
      ],
      [
        "sdk",
        "Android dependency requires a higher compileSdk",
        "Raise compileSdk independently of minSdk and update compatible build tooling.",
      ],
      [
        "cleartext",
        "Android app cannot call a local HTTP API",
        "Use HTTPS or a narrowly scoped network security configuration for development hosts.",
      ],
    ],
    queries: [
      "android 12 exported needs explicit value",
      "manifest merger failed attribute application conflict",
    ],
  },
  {
    id: "s3-access",
    tags: "aws,s3,iam",
    issues: [
      [
        "deny",
        "S3 returns AccessDenied despite an allow policy",
        "Check bucket policy, SCP, permission boundary, KMS policy, and explicit denies in the full authorization path.",
      ],
      [
        "region",
        "S3 request is sent to the wrong regional endpoint",
        "Construct the client in the bucket region or follow the region redirect.",
      ],
      [
        "cors",
        "Browser upload to S3 fails its preflight",
        "Allow the exact origin, method, and requested headers in the bucket CORS rules.",
      ],
      [
        "signature",
        "S3 presigned URL has a signature mismatch",
        "Preserve encoded query parameters, region, method, and signed headers exactly.",
      ],
    ],
    queries: [
      "s3 AccessDenied identity policy allows GetObject",
      "PermanentRedirect bucket must be addressed using specified endpoint",
    ],
  },
  {
    id: "oauth-flow",
    tags: "oauth,oidc,authentication",
    issues: [
      [
        "redirect",
        "OAuth provider rejects redirect_uri mismatch",
        "Register and send the exact callback URI including scheme, host, port, path, and trailing slash.",
      ],
      [
        "state",
        "OAuth callback fails state validation",
        "Store state in a secure same-site session and ensure the callback returns to the same browser context.",
      ],
      [
        "pkce",
        "OAuth token exchange rejects the PKCE verifier",
        "Persist the original verifier and derive the challenge with the required S256 encoding.",
      ],
      [
        "audience",
        "OIDC token has an invalid audience",
        "Validate against the client or API audience intended for that token rather than another resource.",
      ],
    ],
    queries: ["redirect_uri_mismatch oauth exact callback", "invalid_grant code verifier PKCE"],
  },
  {
    id: "graphql-cache",
    tags: "graphql,api,caching",
    issues: [
      [
        "nplus",
        "GraphQL resolver issues one query per child",
        "Batch and cache request-scoped loads with a DataLoader keyed by the child identifier.",
      ],
      [
        "union",
        "GraphQL cannot resolve an abstract union type",
        "Return __typename or implement resolveType consistently with schema member names.",
      ],
      [
        "null",
        "GraphQL null bubbles to the parent unexpectedly",
        "Fix the resolver returning null for a non-null field or loosen the schema only when null is valid.",
      ],
      [
        "persisted",
        "Persisted GraphQL query is not found after deployment",
        "Publish the client manifest before serving the new client and retain compatible manifests during rollout.",
      ],
    ],
    queries: [
      "graphql resolver N+1 database queries",
      "Abstract type must resolve to an Object type runtime",
    ],
  },
  {
    id: "grpc-connectivity",
    tags: "grpc,http2,networking",
    issues: [
      [
        "http2",
        "gRPC call fails through a proxy that downgrades HTTP",
        "Configure end-to-end HTTP/2 or use a proxy mode that explicitly supports gRPC.",
      ],
      [
        "size",
        "gRPC rejects a response larger than the maximum message",
        "Paginate or stream large payloads, or align bounded message limits on both sides.",
      ],
      [
        "deadline",
        "gRPC calls accumulate without deadlines",
        "Set client deadlines and propagate cancellation through downstream work.",
      ],
      [
        "tls",
        "gRPC TLS handshake uses the wrong server name",
        "Set the authority/server name to a certificate SAN while connecting to the intended endpoint.",
      ],
    ],
    queries: [
      "grpc UNAVAILABLE HTTP status code 502 proxy http2",
      "RESOURCE_EXHAUSTED received message larger than max",
    ],
  },
  {
    id: "websocket-lifecycle",
    tags: "websocket,realtime,networking",
    issues: [
      [
        "idle",
        "WebSocket closes after being idle behind a load balancer",
        "Send bounded heartbeats and set idle timeouts consistently across client, proxy, and server.",
      ],
      [
        "reconnect",
        "Every client reconnects simultaneously after an outage",
        "Use exponential backoff with jitter and cap retries.",
      ],
      [
        "backpressure",
        "WebSocket server memory grows with slow clients",
        "Track buffered data and pause, drop, or disconnect consumers that exceed limits.",
      ],
      [
        "sticky",
        "WebSocket messages disappear across multiple server instances",
        "Use a shared pub/sub layer and route connection state deliberately rather than relying only on stickiness.",
      ],
    ],
    queries: [
      "websocket disconnects exactly after load balancer idle timeout",
      "reconnect storm after websocket server restart",
    ],
  },
  {
    id: "sqlite-locking",
    tags: "sqlite,database,concurrency",
    issues: [
      [
        "busy",
        "SQLite returns database is locked under concurrent writes",
        "Use short transactions, set a busy timeout, and serialize the write-heavy path.",
      ],
      [
        "wal",
        "SQLite WAL file grows without being checkpointed",
        "Ensure readers finish and configure or trigger checkpoints at a safe cadence.",
      ],
      [
        "foreign",
        "SQLite accepts rows that violate foreign keys",
        "Enable PRAGMA foreign_keys on every database connection.",
      ],
      [
        "memory",
        "Separate SQLite in-memory connections see different databases",
        "Share one connection or use a named shared-cache URI when appropriate.",
      ],
    ],
    queries: [
      "SQLITE_BUSY database is locked concurrent writers",
      "sqlite -wal file keeps growing long reader",
    ],
  },
  {
    id: "systemd-service",
    tags: "linux,systemd,services",
    issues: [
      [
        "path",
        "A systemd service cannot find a command available in the shell",
        "Use an absolute executable path and set required environment explicitly in the unit.",
      ],
      [
        "restart",
        "A systemd service enters start-limit-hit",
        "Fix the crash loop, reset-failed, and use a bounded restart policy.",
      ],
      [
        "network",
        "A systemd service starts before networking is usable",
        "Order after network-online.target and enable the matching wait-online service when truly required.",
      ],
      [
        "user",
        "A systemd service cannot read an application file",
        "Run as the intended user and grant filesystem access without weakening unrelated paths.",
      ],
    ],
    queries: [
      "systemd status 203 EXEC command works terminal",
      "service start request repeated too quickly start-limit-hit",
    ],
  },
  {
    id: "dns-resolution",
    tags: "dns,networking,operations",
    issues: [
      [
        "negative",
        "DNS keeps returning NXDOMAIN after a record is added",
        "Wait for negative-cache TTL expiry or flush the validating resolver cache.",
      ],
      [
        "cname",
        "A DNS CNAME at the zone apex is rejected",
        "Use an ALIAS/ANAME provider feature or address records instead of an apex CNAME.",
      ],
      [
        "split",
        "A hostname resolves differently inside the VPN",
        "Inspect split-DNS routing and query the authoritative resolver for the intended network.",
      ],
      [
        "servfail",
        "DNSSEC validation produces SERVFAIL",
        "Repair the DS/DNSKEY chain or remove the stale delegation through the registrar.",
      ],
    ],
    queries: ["new DNS record still NXDOMAIN negative cache", "cannot create CNAME at root apex"],
  },
  {
    id: "tls-certificates",
    tags: "tls,certificates,security",
    issues: [
      [
        "chain",
        "TLS client reports unable to verify the first certificate",
        "Serve the leaf certificate with the required intermediate chain, excluding the root.",
      ],
      [
        "name",
        "TLS certificate is valid but hostname verification fails",
        "Issue a certificate whose SAN contains the hostname clients use.",
      ],
      [
        "clock",
        "TLS certificate appears not yet valid on one host",
        "Correct the host clock and enable reliable time synchronization.",
      ],
      [
        "key",
        "Server rejects a certificate and private key pair",
        "Verify their public keys match and load the unencrypted key in the expected format.",
      ],
    ],
    queries: [
      "unable to verify first certificate missing intermediate",
      "x509 certificate valid for different hostname SAN",
    ],
  },
  {
    id: "package-publish",
    tags: "npm,packages,publishing",
    issues: [
      [
        "files",
        "Published npm package is missing runtime files",
        "Include required artifacts through files or remove an excluding npmignore rule, then inspect npm pack output.",
      ],
      [
        "provenance",
        "npm provenance publishing fails in CI",
        "Use a supported trusted publisher workflow with id-token permissions and current npm tooling.",
      ],
      [
        "exports",
        "Consumers cannot import a published package entry",
        "Map import, require, and types targets to files that are actually included in the tarball.",
      ],
      [
        "version",
        "npm refuses to publish an existing version",
        "Increment the package version; published registry versions are immutable.",
      ],
    ],
    queries: [
      "npm package tarball missing dist files",
      "package exports points to file that npm publish excluded",
    ],
  },
  {
    id: "next-build",
    tags: "nextjs,build,deployment",
    issues: [
      [
        "window",
        "Next.js build fails because window is not defined",
        "Move browser API access into a client effect or dynamically load the browser-only component.",
      ],
      [
        "env",
        "Next.js public environment value is undefined in the browser",
        "Expose a NEXT_PUBLIC variable at build time and rebuild the client bundle.",
      ],
      [
        "dynamic",
        "Next.js static generation fails on request cookies",
        "Mark the route dynamic or remove request-bound APIs from the static render path.",
      ],
      [
        "standalone",
        "Next.js standalone deployment misses static assets",
        "Copy .next/static and public beside the standalone server output.",
      ],
    ],
    queries: [
      "La compilation Next.js échoue car window n'est pas défini",
      "La variable publique est absente dans le navigateur après le déploiement",
    ],
  },
  {
    id: "react-native",
    tags: "react-native,metro,mobile",
    issues: [
      [
        "metro",
        "React Native Metro cannot resolve a workspace package",
        "Watch the workspace root and configure resolver paths without loading duplicate React copies.",
      ],
      [
        "pods",
        "React Native iOS native module is missing after install",
        "Run pod install from the ios directory and rebuild the native application.",
      ],
      [
        "adb",
        "React Native Android device cannot reach the development server",
        "Use adb reverse for the Metro port or configure the host address reachable by the device.",
      ],
      [
        "duplicate",
        "React Native reports two copies of React",
        "Deduplicate React and ensure workspace symlinks resolve to the application's dependency.",
      ],
    ],
    queries: [
      "Metro ne trouve pas un paquet du monorepo React Native",
      "Le module natif reste introuvable après l'installation du paquet",
    ],
  },
  {
    id: "postgres-pool",
    tags: "postgres,pooling,performance",
    issues: [
      [
        "limit",
        "Postgres reaches max_connections during traffic spikes",
        "Bound application pools, reserve administrative capacity, and add a pooler when connection fan-out is high.",
      ],
      [
        "leak",
        "Application pool connections are never returned",
        "Release clients in a finally block on every success and error path.",
      ],
      [
        "timeout",
        "Requests wait indefinitely for a database connection",
        "Set a pool acquisition timeout and surface saturation separately from query timeout.",
      ],
      [
        "size",
        "Each application replica opens a full-size database pool",
        "Budget the pool across all replicas rather than applying the per-process maximum globally.",
      ],
    ],
    queries: [
      "Postgres refuse les connexions avec too many clients",
      "Les connexions fuient car le client du pool n'est jamais libéré",
    ],
  },
  {
    id: "compose-network",
    tags: "docker-compose,networking,containers",
    issues: [
      [
        "localhost",
        "A Compose container cannot reach another service at localhost",
        "Use the Compose service name and container port; localhost refers to the current container.",
      ],
      [
        "ready",
        "Compose dependent service starts before the database is ready",
        "Add a healthcheck and gate the dependent service on service_healthy, while retaining retry logic.",
      ],
      [
        "volume",
        "A Compose bind mount hides files from the image",
        "Mount only the required path or populate dependencies outside the covered directory.",
      ],
      [
        "dns",
        "Compose service name stops resolving after a custom network change",
        "Attach both services to the same network and use a declared alias when needed.",
      ],
    ],
    queries: [
      "Un conteneur Compose ne peut pas joindre la base sur localhost",
      "Le service dépendant démarre avant que la base soit réellement prête",
    ],
  },
  {
    id: "playwright-waits",
    tags: "playwright,testing,timeouts",
    issues: [
      [
        "sleep",
        "Playwright test is flaky despite fixed sleeps",
        "Wait on a user-visible locator or network state instead of elapsed time.",
      ],
      [
        "strict",
        "Playwright locator fails strict mode with multiple elements",
        "Narrow the locator by role, name, or stable container instead of selecting the first match.",
      ],
      [
        "navigation",
        "Playwright click races with page navigation",
        "Start the navigation expectation before or with the action and wait for the intended URL or UI state.",
      ],
      [
        "animation",
        "Playwright clicks an element while it is moving",
        "Wait for the stable interactive state or disable nonessential animation in tests.",
      ],
    ],
    queries: [
      "Test Playwright instable malgré waitForTimeout",
      "Le sélecteur correspond à plusieurs boutons en mode strict",
    ],
  },
  {
    id: "pnpm-peer",
    tags: "pnpm,workspace,dependencies",
    issues: [
      [
        "peer",
        "pnpm workspace has conflicting React peer versions",
        "Align React versions across consumers and keep libraries declaring React as a compatible peer.",
      ],
      [
        "catalog",
        "pnpm catalog version is not applied to a package",
        "Reference the dependency with catalog: and define it in the workspace catalog.",
      ],
      [
        "filter",
        "pnpm filter selects no workspace packages",
        "Use the package name or a correctly rooted directory selector and inspect pnpm list -r.",
      ],
      [
        "link",
        "A workspace dependency resolves from the registry",
        "Use workspace: protocol when local resolution is required.",
      ],
    ],
    queries: [
      "تعارض إصدارات React peer dependency في pnpm workspace",
      "يتم تنزيل الاعتماد من المستودع البعيد بدل ربط الحزمة المحلية",
    ],
  },
  {
    id: "cloudflare-d1",
    tags: "cloudflare,d1,sqlite",
    issues: [
      [
        "binding",
        "Cloudflare Worker D1 binding is undefined",
        "Declare the binding in the active Wrangler environment and type the matching Env key.",
      ],
      [
        "batch",
        "D1 migration is slow from one statement per request",
        "Use prepared statements with batch for bounded groups and avoid remote request-per-row loops.",
      ],
      [
        "local",
        "Local D1 data differs between Wrangler commands",
        "Use the same persistence directory and environment for dev and migration commands.",
      ],
      [
        "transaction",
        "D1 code assumes an interactive transaction",
        "Use D1 batch semantics and design operations for the transaction capabilities the service exposes.",
      ],
    ],
    queries: [
      "ربط D1 غير موجود داخل Cloudflare Worker",
      "إدخال الصفوف بطيء بسبب إرسال طلب منفصل لكل صف",
    ],
  },
  {
    id: "git-rebase",
    tags: "git,rebase,version-control",
    issues: [
      [
        "continue",
        "Git rebase cannot continue after conflicts",
        "Resolve every conflict, stage the files, and run rebase --continue without creating an unrelated commit.",
      ],
      [
        "abort",
        "An interrupted rebase left the branch confusing",
        "Use rebase --abort to restore the pre-rebase state when the operation should be discarded.",
      ],
      [
        "empty",
        "Git rebase stops because a commit became empty",
        "Skip it when its change is already present or keep an intentionally empty commit explicitly.",
      ],
      [
        "remote",
        "Rebased branch is rejected by the remote",
        "Push with --force-with-lease after coordinating the history rewrite.",
      ],
    ],
    queries: [
      "كيف أتابع git rebase بعد حل التعارضات",
      "الفرع المعاد ترتيبه مرفوض عند النشر دون خسارة عمل الآخرين",
    ],
  },
  {
    id: "ts-modules",
    tags: "typescript,esm,configuration",
    issues: [
      [
        "syntax",
        "TypeScript emits imports that Node treats as CommonJS",
        "Align package type, module, and moduleResolution so emitted files use the intended module system.",
      ],
      [
        "types",
        "TypeScript resolves runtime code but not package types",
        "Expose a valid types condition or top-level types entry pointing at included declarations.",
      ],
      [
        "verbatim",
        "TypeScript runtime import is missing after compilation",
        "Use a value import when the symbol is needed at runtime; type-only imports are erased.",
      ],
      [
        "dual",
        "A dual package creates separate ESM and CommonJS singleton state",
        "Avoid stateful dual entrypoints or route both conditions through one shared implementation.",
      ],
    ],
    queries: [
      "Node يعامل ناتج TypeScript كـ CommonJS بدل ESM",
      "الحزمة تعمل وقت التشغيل لكن المترجم لا يجد ملفات الأنواع",
    ],
  },
  {
    id: "vite-env",
    tags: "vite,environment,frontend",
    issues: [
      [
        "prefix",
        "Vite environment variable is undefined in client code",
        "Prefix public values with VITE_ and read them from import.meta.env.",
      ],
      [
        "runtime",
        "Changing a Vite environment variable does not affect a built app",
        "Vite replaces client values at build time; rebuild or provide a separate runtime configuration endpoint.",
      ],
      [
        "mode",
        "Vite loads the wrong .env file",
        "Start with the intended --mode and understand the ordered .env mode overrides.",
      ],
      [
        "secret",
        "A server secret is exposed in a Vite bundle",
        "Never use the public prefix for secrets; keep them behind a server endpoint.",
      ],
    ],
    queries: [
      "متغير البيئة غير معرف داخل تطبيق Vite في المتصفح",
      "تغيير متغير البيئة بعد البناء لا يغير التطبيق المنشور",
    ],
  },
];

function categoryForTopic(index: number): BenchmarkCategory {
  if (index < 10) return "literal";
  if (index < 20) return "paraphrase";
  if (index < 30) return "solution-intent";
  if (index < 40) return "hard-negative";
  return "cross-language";
}

function languageForTopic(index: number): BenchmarkLanguage {
  if (index < 40) return "en";
  return index < 45 ? "fr" : "ar";
}

export function buildBenchmarkCorpus(): BenchmarkCorpus {
  const documents: BenchmarkDocument[] = [];
  const queries: BenchmarkQuery[] = [];
  topics.forEach((topic, topicIndex) => {
    topic.issues.forEach(([issueId, problem, solution]) => {
      documents.push({ id: `${topic.id}-${issueId}`, problem, solution, tags: topic.tags });
    });
    const category = categoryForTopic(topicIndex);
    const language = languageForTopic(topicIndex);
    for (let queryIndex = 0; queryIndex < 2; queryIndex += 1) {
      const target = `${topic.id}-${topic.issues[queryIndex]![0]}`;
      const related = `${topic.id}-${topic.issues[queryIndex === 0 ? 1 : 0]![0]}`;
      queries.push({
        id: `${topic.id}-q${queryIndex + 1}`,
        text: topic.queries[queryIndex]!,
        language,
        category,
        expectedRetrieval:
          category === "literal"
            ? "exact"
            : category === "cross-language" && queryIndex === 1
              ? "semantic"
              : "relaxed",
        ...(category === "cross-language" ? { lexicalAnchor: queryIndex === 0 } : {}),
        relevance: { [target]: 3, [related]: 1 },
      });
    }
  });
  return { version: 1, documents, queries };
}

export function validateBenchmarkCorpus(corpus: BenchmarkCorpus) {
  if (corpus.documents.length !== 200)
    throw new Error("Benchmark corpus must contain 200 documents");
  if (corpus.queries.length !== 100) throw new Error("Benchmark corpus must contain 100 queries");
  const documentIds = new Set(corpus.documents.map((document) => document.id));
  if (documentIds.size !== corpus.documents.length)
    throw new Error("Benchmark document ids must be unique");
  const queryIds = new Set(corpus.queries.map((query) => query.id));
  if (queryIds.size !== corpus.queries.length)
    throw new Error("Benchmark query ids must be unique");
  for (const query of corpus.queries) {
    if (!Object.keys(query.relevance).some((id) => query.relevance[id]! >= 2)) {
      throw new Error(`${query.id} has no useful relevant document`);
    }
    for (const documentId of Object.keys(query.relevance)) {
      if (!documentIds.has(documentId))
        throw new Error(`${query.id} references missing ${documentId}`);
    }
  }
  const normalizedTokens = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  for (const query of corpus.queries.filter((item) => item.expectedRetrieval === "exact")) {
    const targetId = Object.entries(query.relevance).find(([, grade]) => grade === 3)?.[0];
    const target = corpus.documents.find((document) => document.id === targetId);
    const targetTokens = new Set(
      normalizedTokens(`${target?.problem ?? ""} ${target?.solution ?? ""} ${target?.tags ?? ""}`),
    );
    const missing = normalizedTokens(query.text).filter((token) => !targetTokens.has(token));
    if (missing.length)
      throw new Error(`${query.id} exact query has missing target terms: ${missing}`);
  }
  const count = (value: string, key: "category" | "language") =>
    corpus.queries.filter((query) => query[key] === value).length;
  for (const category of [
    "literal",
    "paraphrase",
    "solution-intent",
    "hard-negative",
    "cross-language",
  ]) {
    if (count(category, "category") !== 20) throw new Error(`${category} must contain 20 queries`);
  }
  if (
    count("en", "language") !== 80 ||
    count("fr", "language") !== 10 ||
    count("ar", "language") !== 10
  ) {
    throw new Error("Benchmark language distribution must be 80 English, 10 French, and 10 Arabic");
  }
}

export const benchmarkCorpus = buildBenchmarkCorpus();
validateBenchmarkCorpus(benchmarkCorpus);
