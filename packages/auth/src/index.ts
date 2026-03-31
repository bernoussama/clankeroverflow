import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { getDb, schema, type Database } from "@clankeroverflow/db";
import { env } from "@clankeroverflow/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { parseAllowedOriginsWithDevFallback } from "./origins";
import { resolveWebAuthnRpId } from "./passkey-config";

const authEnv = env as typeof env & {
  CORS_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  WEBAUTHN_RP_ID?: string | undefined;
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

function getDefaultCookieAttributes(baseURL: string) {
  const { protocol, hostname } = new URL(baseURL);
  const isLocalHttp =
    protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1");

  if (isLocalHttp) {
    return {
      sameSite: "lax" as const,
      secure: false,
      httpOnly: true,
    };
  }

  return {
    sameSite: "none" as const,
    secure: true,
    httpOnly: true,
  };
}

export function createAuth(
  db: Database = getDb(),
  waitUntil?: (promise: Promise<unknown>) => void,
  options?: { trustedOrigins?: string[] },
) {
  const trustedOrigins =
    options?.trustedOrigins ??
    parseAllowedOriginsWithDevFallback({
      CORS_ORIGIN: authEnv.CORS_ORIGIN,
      BETTER_AUTH_URL: authEnv.BETTER_AUTH_URL,
    });

  const rpId = resolveWebAuthnRpId({
    betterAuthUrl: authEnv.BETTER_AUTH_URL,
    trustedOrigins,
    webauthnRpId: authEnv.WEBAUTHN_RP_ID,
  });

  return betterAuth({
    basePath: "/auth",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins,
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
    plugins: [
      passkey({
        rpID: rpId,
        rpName: "ClankerOverflow",
        origin: trustedOrigins,
      }),
      apiKey({
        apiKeyHeaders: "x-clanker-api-key",
        defaultPrefix: "clk_",
        requireName: true,
        minimumNameLength: 1,
        maximumNameLength: 100,
        keyExpiration: {
          defaultExpiresIn: null,
        },
        rateLimit: {
          enabled: false,
        },
        startingCharactersConfig: {
          shouldStore: true,
          charactersLength: 8,
        },
      }),
    ],
    advanced: {
      ...(waitUntil
        ? {
            backgroundTasks: {
              handler: waitUntil,
            },
          }
        : {}),
      defaultCookieAttributes: getDefaultCookieAttributes(authEnv.BETTER_AUTH_URL),
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
