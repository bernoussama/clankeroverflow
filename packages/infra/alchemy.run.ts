import alchemy from "alchemy";
import { Ai, Hyperdrive, Nextjs, VectorizeIndex, Worker } from "alchemy/cloudflare";
import { getDatabaseUrlErrorMessage, loadInfraEnv } from "./src/env";

const app = await alchemy("clankeroverflow");

const isLocal = app.local;
loadInfraEnv(isLocal);

/** Local split-origin dev (web :3001 → API :3000) if env files omit CORS_ORIGIN. */
const LOCAL_DEFAULT_CORS_ORIGIN =
  "http://localhost:3001,http://127.0.0.1:3001,http://[::1]:3001";

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
    });

/** 768 dims + cosine for `@cf/baai/bge-base-en-v1.5` (Workers AI). */
const solutionVectorIndex = await VectorizeIndex("solution-vectors", {
  dimensions: 768,
  metric: "cosine",
  adopt: true,
});

const workersAi = Ai();

const posthogKey = (process.env.NEXT_PUBLIC_POSTHOG_KEY ?? alchemy.env.NEXT_PUBLIC_POSTHOG_KEY)?.trim();
const posthogHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? alchemy.env.NEXT_PUBLIC_POSTHOG_HOST)?.trim();

export const web = await Nextjs("web", {
  cwd: "../../apps/web",
  adopt: true,
  domains: [
    {
      domainName: "clankeroverflow.com",
      adopt: true,
    },
    {
      domainName: "www.clankeroverflow.com",
      adopt: true,
    },
  ],
  bindings: {
    NEXT_PUBLIC_SERVER_URL: alchemy.env.NEXT_PUBLIC_SERVER_URL!,
    CORS_ORIGIN: corsOrigin,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    ...(posthogKey ? { NEXT_PUBLIC_POSTHOG_KEY: posthogKey } : {}),
    ...(posthogHost ? { NEXT_PUBLIC_POSTHOG_HOST: posthogHost } : {}),
  },
  dev: {
    env: {
      PORT: "3001",
    },
  },
});

export const server = await Worker("server", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
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
  },
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
