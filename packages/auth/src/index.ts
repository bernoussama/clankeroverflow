import { getDb } from "@clankeroverflow/db";
import * as schema from "@clankeroverflow/db/schema/auth";
import { env } from "@clankeroverflow/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const authEnv = env as typeof env & {
  CORS_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
};

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins: [authEnv.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    // uncomment cookieCache setting when ready to deploy to Cloudflare using *.workers.dev domains
    // session: {
    //   cookieCache: {
    //     enabled: true,
    //     maxAge: 60,
    //   },
    // },
    secret: authEnv.BETTER_AUTH_SECRET,
    baseURL: authEnv.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
      // uncomment crossSubDomainCookies setting when ready to deploy and replace <your-workers-subdomain> with your actual workers subdomain
      // https://developers.cloudflare.com/workers/wrangler/configuration/#workersdev
      // crossSubDomainCookies: {
      //   enabled: true,
      //   domain: "<your-workers-subdomain>",
      // },
    },
  });
}

let authInstance: ReturnType<typeof createAuth> | null = null;

export function getAuth(): ReturnType<typeof createAuth> {
  if (authInstance) {
    return authInstance;
  }

  authInstance = createAuth();

  return authInstance;
}
