import { getDb, schema, type Database } from "@clankeroverflow/db";
import { env } from "@clankeroverflow/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { parseAllowedOrigins } from "./origins";

const authEnv = env as typeof env & {
  CORS_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
};

function getCrossSubDomainCookieOptions(baseURL: string) {
  const hostname = new URL(baseURL).hostname;

  if (hostname.endsWith(".clankeroverflow.com")) {
    return {
      enabled: true,
      domain: "clankeroverflow.com",
    } as const;
  }

  return undefined;
}

export function createAuth(
  db: Database = getDb(),
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  return betterAuth({
    basePath: "/auth",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins: parseAllowedOrigins(authEnv.CORS_ORIGIN),
    socialProviders: {
      github: {
        clientId: authEnv.GITHUB_CLIENT_ID,
        clientSecret: authEnv.GITHUB_CLIENT_SECRET,
      },
    },
    account: {
      storeStateStrategy: "cookie",
    },
    secret: authEnv.BETTER_AUTH_SECRET,
    baseURL: authEnv.BETTER_AUTH_URL,
    advanced: {
      ...(waitUntil
        ? {
            backgroundTasks: {
              handler: waitUntil,
            },
          }
        : {}),
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
      crossSubDomainCookies: getCrossSubDomainCookieOptions(authEnv.BETTER_AUTH_URL),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let authInstance: ReturnType<typeof createAuth> | null = null;

export function getAuth(): ReturnType<typeof createAuth> {
  if (authInstance) {
    return authInstance;
  }

  authInstance = createAuth();

  return authInstance;
}
