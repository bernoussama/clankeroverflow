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
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createRequestResourceLifecycle } from "./request-lifecycle";

type AppEnv = {
  Variables: {
    auth: Auth;
    db: Database;
    posthog?: PostHogClient;
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
const oauthProtectedResourceMetadata = {
  resource: apiOrigin,
  authorization_servers: [authIssuer],
  scopes_supported: ["solutions:read", "solutions:write"],
  bearer_methods_supported: ["header"],
  resource_documentation: "https://clankeroverflow.com/opencode/clankeroverflow.md",
} as const;
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const app = new Hono<AppEnv>();

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
  c.set("auth", createAuth(db, lifecycle.waitUntil));
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

app.use(logger());
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
  const requestPostHog = c.get("posthog");
  const posthog = requestPostHog ?? createPostHog(postHogEnvForRequest(c));
  posthog?.captureException(err);
  if (posthog !== requestPostHog) {
    void shutdownPostHog(posthog, getWaitUntilHandler(c));
  }
  return c.text("Internal Server Error", 500);
});

export default app;
