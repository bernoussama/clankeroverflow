import { getDb, schema, type Database } from "@clankeroverflow/db";
import { env } from "@clankeroverflow/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const authEnv = env as typeof env & {
  CORS_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
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

export function createAuth(db: Database = getDb()) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins: [authEnv.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    secret: authEnv.BETTER_AUTH_SECRET,
    baseURL: authEnv.BETTER_AUTH_URL,
    advanced: {
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
