import alchemy from "alchemy";
import { Hyperdrive, Nextjs, Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("clankeroverflow");

const isLocal = app.local;

const hyperdrive = isLocal
  ? null
  : await Hyperdrive("hyperdrive", {
      origin: alchemy.secret.env.DATABASE_URL!,
    });

export const web = await Nextjs("web", {
  cwd: "../../apps/web",
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
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    ...(isLocal
      ? { DATABASE_URL: alchemy.secret.env.DATABASE_URL! }
      : { HYPERDRIVE: hyperdrive! }),
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
