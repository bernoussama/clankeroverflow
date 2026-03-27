import { createContext } from "@clankeroverflow/api/context";
import { parseAllowedOrigins } from "@clankeroverflow/auth/origins";
import { appRouter } from "@clankeroverflow/api/routers/index";
import { createAuth, type Auth } from "@clankeroverflow/auth";
import { createDb, type Database } from "@clankeroverflow/db";
import { env } from "@clankeroverflow/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createRequestResourceLifecycle } from "./request-lifecycle";
import { env as workerEnv } from "cloudflare:workers";

type AppEnv = {
  Variables: {
    auth: Auth;
    db: Database;
    solutionsKv: KVNamespace | null;
  };
};

const serverEnv = env as typeof env & {
  CORS_ORIGIN: string;
};

const allowedOrigins = parseAllowedOrigins(serverEnv.CORS_ORIGIN);
const allowedOriginSet = new Set(allowedOrigins);
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

  c.set("db", db);
  c.set("auth", createAuth(db, lifecycle.waitUntil));
  c.set("solutionsKv", workerEnv.SOLUTIONS_KV ?? null);

  try {
    await next();
  } finally {
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
  if (requestOrigin && allowedOriginSet.has(requestOrigin)) {
    return next();
  }

  return c.text("Forbidden", 403);
};

app.use(logger());
app.use("/*", withSecurityHeaders);
app.use(
  "/*",
  cors({
    origin: allowedOrigins,
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
  return c.text("OK");
});

export default app;
