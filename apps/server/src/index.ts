import { createContext } from "@clankeroverflow/api/context";
import { parseAllowedOriginsWithDevFallback } from "@clankeroverflow/auth/origins";
import { appRouter } from "@clankeroverflow/api/routers/index";
import { createAuth, type Auth } from "@clankeroverflow/auth";
import { createDb, type Database } from "@clankeroverflow/db";
import { trpcServer } from "@hono/trpc-server";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

type ServerBindings = {
  CORS_ORIGIN?: string;
  BETTER_AUTH_URL?: string;
  DATABASE_URL?: string;
  HYPERDRIVE?: { connectionString?: string };
  BETTER_AUTH_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

type AppEnv = {
  Bindings: ServerBindings;
  Variables: {
    auth: Auth;
    db: Database;
  };
};
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
  c.set("db", db);
  c.set(
    "auth",
    createAuth(db, getWaitUntilHandler(c), {
      trustedOrigins: parseAllowedOriginsWithDevFallback(c.env),
    }),
  );

  try {
    await next();
  } finally {
    await close();
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
  const allowedOriginSet = new Set(parseAllowedOriginsWithDevFallback(c.env));
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
    origin: (origin, c) => {
      const allowed = parseAllowedOriginsWithDevFallback(c.env);
      return allowed.includes(origin) ? origin : null;
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
