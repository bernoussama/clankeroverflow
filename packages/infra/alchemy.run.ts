import { createHash } from "node:crypto";

import alchemy from "alchemy";
import { Ai, Hyperdrive, Nextjs, VectorizeIndex, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore, FileSystemStateStore } from "alchemy/state";

const { getDatabaseUrlErrorMessage, loadInfraEnv } = await import(
  new URL("./src/env.ts", import.meta.url).href
);

const cloudflareStateToken =
  process.env.ALCHEMY_STATE_TOKEN?.trim() ||
  process.env.ALCHEMY_PASSWORD?.trim() ||
  process.env.CLOUDFLARE_API_TOKEN?.trim() ||
  (() => {
    throw new Error(
      "ALCHEMY_STATE_TOKEN, ALCHEMY_PASSWORD, or CLOUDFLARE_API_TOKEN is required for Cloudflare state store deployments.",
    );
  })();

const app = await alchemy("clankeroverflow", {
  stateStore: (scope) =>
    scope.local
      ? new FileSystemStateStore(scope)
      : new CloudflareStateStore(scope, {
          stateToken: alchemy.secret(
            createHash("sha256").update(cloudflareStateToken).digest("hex"),
          ),
        }),
});

const isLocal = app.local;
loadInfraEnv(isLocal);

/** Local split-origin dev (web :3001 → API :3000) if env files omit CORS_ORIGIN. */
const LOCAL_DEFAULT_CORS_ORIGIN = "http://localhost:3001,http://127.0.0.1:3001,http://[::1]:3001";

/** Prefer `process.env` so values from `loadInfraEnv` win over any Alchemy snapshot. */
const rawCorsOrigin = (process.env.CORS_ORIGIN ?? alchemy.env.CORS_ORIGIN)?.trim() ?? "";
const corsOrigin = rawCorsOrigin
  ? rawCorsOrigin
  : isLocal
    ? LOCAL_DEFAULT_CORS_ORIGIN
    : (() => {
        throw new Error(
          "CORS_ORIGIN is required for production. Set it in packages/infra/.env.production.",
        );
      })();

const databaseUrl = alchemy.secret.env(
  "DATABASE_URL",
  process.env.DATABASE_URL,
  getDatabaseUrlErrorMessage(isLocal),
);

const hyperdrive = isLocal
  ? null
  : await Hyperdrive("hyperdrive", {
      origin: databaseUrl,
      adopt: true,
      caching: {
        disabled: true,
      },
    });

/** 768 dims + cosine for `@cf/baai/bge-base-en-v1.5` (Workers AI). */
const solutionVectorIndex = await VectorizeIndex("solution-vectors", {
  dimensions: 768,
  metric: "cosine",
  adopt: true,
});

const workersAi = Ai();
const sentryDsn = process.env.SENTRY_DSN?.trim();
const sentryTestToken = process.env.SENTRY_TEST_TOKEN?.trim();
const deploymentEnvironment = isLocal ? "development" : "production";
const serviceVersion =
  process.env.SERVICE_VERSION?.trim() || process.env.COMMIT_SHA?.trim() || "unknown";
const commitSha = process.env.COMMIT_SHA?.trim() || "unknown";

export const web = await Nextjs("web", {
  cwd: "../../apps/web",
  adopt: true,
  domains: [
    {
      domainName: "www.clankeroverflow.com",
      adopt: true,
    },
  ],
  bindings: {
    NEXT_PUBLIC_SERVER_URL: alchemy.env.NEXT_PUBLIC_SERVER_URL!,
    NEXT_PUBLIC_POSTHOG_KEY: alchemy.env.POSTHOG_API_KEY!,
    NEXT_PUBLIC_POSTHOG_HOST: alchemy.env.POSTHOG_HOST!,
    CORS_ORIGIN: corsOrigin,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
  },
  dev: {
    env: {
      PORT: "3001",
    },
  },
});

export const server = await Worker("server", {
  placement: { mode: "smart" },
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  sourceMap: true,
  domains: [
    {
      domainName: "api.clankeroverflow.com",
      adopt: true,
    },
  ],
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    ...(isLocal ? { DATABASE_URL: databaseUrl } : { HYPERDRIVE: hyperdrive! }),
    CORS_ORIGIN: corsOrigin,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    GITHUB_CLIENT_ID: alchemy.env.GITHUB_CLIENT_ID!,
    GITHUB_CLIENT_SECRET: alchemy.secret.env.GITHUB_CLIENT_SECRET!,
    AI: workersAi,
    SOLUTION_VECTORS: solutionVectorIndex,
    POSTHOG_API_KEY: alchemy.env.POSTHOG_API_KEY!,
    POSTHOG_HOST: alchemy.env.POSTHOG_HOST!,
    ...(sentryDsn ? { SENTRY_DSN: sentryDsn } : {}),
    ...(sentryTestToken
      ? {
          SENTRY_TEST_TOKEN: alchemy.secret.env("SENTRY_TEST_TOKEN", sentryTestToken),
        }
      : {}),
    ENVIRONMENT: deploymentEnvironment,
    SERVICE_VERSION: serviceVersion,
    COMMIT_SHA: commitSha,
  },
  observability: {
    enabled: true,
    headSamplingRate: 1,
    logs: {
      enabled: true,
      headSamplingRate: 1,
      persist: true,
      invocationLogs: true,
    },
    traces: {
      enabled: true,
      headSamplingRate: 1,
      persist: true,
    },
  },
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
