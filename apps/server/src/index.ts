import { createContext } from "@clankeroverflow/api/context";
import {
  createPostHog,
  shutdownPostHog,
  type PostHogClient,
  type PostHogEnv,
} from "@clankeroverflow/api/posthog";
import {
  parseAllowedOrigins,
  parseAllowedOriginsWithDevFallback,
  type WorkerOriginBindings,
} from "@clankeroverflow/auth/origins";
import { appRouter } from "@clankeroverflow/api/routers/index";
import { createAuth, type Auth } from "@clankeroverflow/auth";
import { createDb, type Database } from "@clankeroverflow/db";
import { env } from "@clankeroverflow/env/server";
import { trpcServer } from "@hono/trpc-server";
import * as Sentry from "@sentry/cloudflare";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

import { createRequestResourceLifecycle } from "./request-lifecycle";
import { withRequestLogging, type RequestLogEvent } from "./request-logging";

type AppEnv = {
  Bindings: SentryBindings;
  Variables: {
    auth: Auth;
    db: Database;
    posthog?: PostHogClient;
    requestLog?: RequestLogEvent;
  };
};

const serverEnv = env as typeof env & {
  CORS_ORIGIN?: string;
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
};

function allowedOriginsForRequest(c: Context<AppEnv>): string[] {
  const bindings = c.env as WorkerOriginBindings | undefined;
  if (bindings) {
    return parseAllowedOriginsWithDevFallback(bindings);
  }
  const cors = serverEnv.CORS_ORIGIN?.trim();
  if (cors) {
    return parseAllowedOrigins(cors);
  }
  return parseAllowedOriginsWithDevFallback({
    CORS_ORIGIN: serverEnv.CORS_ORIGIN,
    BETTER_AUTH_URL: (serverEnv as { BETTER_AUTH_URL?: string }).BETTER_AUTH_URL,
  });
}

function postHogEnvForRequest(c: Context<AppEnv>): PostHogEnv {
  const bindings = c.env as PostHogEnv | undefined;
  return {
    POSTHOG_API_KEY: bindings?.POSTHOG_API_KEY ?? serverEnv.POSTHOG_API_KEY,
    POSTHOG_HOST: bindings?.POSTHOG_HOST ?? serverEnv.POSTHOG_HOST,
  };
}

const securityHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-DNS-Prefetch-Control": "off",
  "X-Frame-Options": "DENY",
} as const;
const nonCacheableHeaders = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;
const apiOrigin = "https://api.clankeroverflow.com";
const authIssuer = `${apiOrigin}/auth`;
const defaultSentryDsn =
  "https://2c5a2f26e1dabc117e673996410d02cb@o4511458204319744.ingest.de.sentry.io/4511458219458640";
const oauthProtectedResourceMetadata = {
  resource: apiOrigin,
  authorization_servers: [authIssuer],
  scopes_supported: ["solutions:read", "solutions:write"],
  bearer_methods_supported: ["header"],
  resource_documentation: "https://clankeroverflow.com/opencode/clankeroverflow.md",
} as const;
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const app = new Hono<AppEnv>();

type SentryBindings = {
  SENTRY_DSN?: string;
  SENTRY_TEST_TOKEN?: string;
  ENVIRONMENT?: string;
  SERVICE_VERSION?: string;
  COMMIT_SHA?: string;
};

export function sentryOptionsForEnv(env: SentryBindings): Sentry.CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN?.trim() || defaultSentryDsn,
    enableLogs: true,
    environment: env.ENVIRONMENT,
    release: env.SERVICE_VERSION || env.COMMIT_SHA,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
  };
}

function getWaitUntilHandler(c: Context<AppEnv>) {
  try {
    return c.executionCtx.waitUntil.bind(c.executionCtx);
  } catch {
    return undefined;
  }
}

const withRequestServices: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { close, db } = await createDb();
  const lifecycle = createRequestResourceLifecycle({
    close,
    waitUntil: getWaitUntilHandler(c),
  });
  const posthog = createPostHog(postHogEnvForRequest(c));

  c.set("db", db);
  c.set("auth", createAuth(db, lifecycle.waitUntil, { posthog: posthog ?? undefined }));
  if (posthog) {
    c.set("posthog", posthog);
  }

  try {
    await next();
  } finally {
    await shutdownPostHog(posthog, lifecycle.waitUntil);
    await lifecycle.closeWhenReady();
  }
};

const withSecurityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();

  for (const [key, value] of Object.entries(securityHeaders)) {
    c.header(key, value);
  }
};

const withNoStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();

  for (const [key, value] of Object.entries(nonCacheableHeaders)) {
    c.header(key, value);
  }
};

function getRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

const withTrustedMutationOrigins: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!unsafeMethods.has(c.req.method)) {
    return next();
  }

  if (c.req.header("x-clanker-api-key") || !c.req.header("cookie")) {
    return next();
  }

  const requestOrigin = getRequestOrigin(c.req.raw);
  const allowed = new Set(allowedOriginsForRequest(c));
  if (requestOrigin && allowed.has(requestOrigin)) {
    return next();
  }

  return c.text("Forbidden", 403);
};

app.use(withRequestLogging);
app.use("/*", withSecurityHeaders);
app.use(
  "/*",
  cors({
    origin: (origin, c) => {
      const list = allowedOriginsForRequest(c as Context<AppEnv>);
      return list.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use("/auth/*", withNoStore);
app.use("/auth/*", withRequestServices);
app.on(["POST", "GET"], "/auth/*", (c) => c.get("auth").handler(c.req.raw));

app.use("/trpc/*", withNoStore);
app.use("/trpc/*", withTrustedMutationOrigins);
app.use("/trpc/*", withRequestServices);

app.get("/.well-known/oauth-protected-resource", (c) => {
  return c.json(oauthProtectedResourceMetadata);
});

app.post("/internal/sentry-test", (c) => {
  const token = c.env?.SENTRY_TEST_TOKEN?.trim();
  if (!token) {
    return c.notFound();
  }

  const authorization = c.req.header("authorization");
  if (authorization !== `Bearer ${token}`) {
    return c.text("Forbidden", 403);
  }

  const error = new Error("Sentry integration test event");
  const eventId = Sentry.captureException(error, {
    tags: {
      smoke_test: "true",
    },
  });

  return c.json({ eventId, ok: true });
});

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.get("/", (c) => {
  c.header(
    "Link",
    '</.well-known/oauth-protected-resource>; rel="oauth-protected-resource"; type="application/json"',
  );
  return c.text("OK");
});

app.onError((err, c) => {
  const requestLog = c.get("requestLog");
  if (requestLog) {
    requestLog.error_type = err.name;
    requestLog.error_message = err.message;
  }

  const requestPostHog = c.get("posthog");
  const posthog = requestPostHog ?? createPostHog(postHogEnvForRequest(c));
  posthog?.captureException(err);
  if (posthog !== requestPostHog) {
    void shutdownPostHog(posthog, getWaitUntilHandler(c));
  }
  return c.text("Internal Server Error", 500);
});

export default Sentry.withSentry((env) => sentryOptionsForEnv(env as SentryBindings), app);
