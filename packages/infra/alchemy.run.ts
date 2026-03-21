import alchemy from "alchemy";
import { Hyperdrive, Nextjs, Worker } from "alchemy/cloudflare";
import { getDatabaseUrlErrorMessage, loadInfraEnv } from "./src/env";

const app = await alchemy("clankeroverflow");

const isLocal = app.local;
loadInfraEnv(isLocal);

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
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
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
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
  },
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
