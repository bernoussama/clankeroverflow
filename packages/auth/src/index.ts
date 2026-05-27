import { apiKey } from "@better-auth/api-key";
import { getDb, schema, type Database } from "@clankeroverflow/db";
import { env } from "@clankeroverflow/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { parseAllowedOriginsWithDevFallback } from "./origins";

type PostHogCapture = {
  capture: (event: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }) => void;
};

type ApiKeyHookRecord = { referenceId?: string; userId?: string; name?: string };

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
  options?: { trustedOrigins?: string[]; posthog?: PostHogCapture },
) {
  const trustedOrigins =
    options?.trustedOrigins ??
    parseAllowedOriginsWithDevFallback({
      CORS_ORIGIN: authEnv.CORS_ORIGIN,
      BETTER_AUTH_URL: authEnv.BETTER_AUTH_URL,
    });

  const ph = options?.posthog;

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
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            ph?.capture({
              distinctId: user.id,
              event: "user signed up",
              properties: { name: user.name, email: user.email },
            });
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            ph?.capture({
              distinctId: session.userId,
              event: "user signed in",
            });
          },
        },
      },
      apikey: {
        create: {
          after: async (k: ApiKeyHookRecord) => {
            ph?.capture({
              distinctId: k.referenceId ?? k.userId ?? "unknown",
              event: "api key created",
              properties: { name: k.name ?? null },
            });
          },
        },
        delete: {
          after: async (k: ApiKeyHookRecord) => {
            ph?.capture({
              distinctId: k.referenceId ?? k.userId ?? "unknown",
              event: "api key deleted",
              properties: { name: k.name ?? null },
            });
          },
        },
      },
    },
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
