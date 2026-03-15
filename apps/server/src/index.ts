import { createContext } from "@clankeroverflow/api/context";
import { appRouter } from "@clankeroverflow/api/routers/index";
import { auth } from "@clankeroverflow/auth";
import { env } from "@clankeroverflow/env/server";
import { trpcServer } from "@hono/trpc-server";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function rateLimiter() {
  return async (c: Context, next: Next) => {
    if (c.req.method === "OPTIONS") return next();

    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
    const now = Date.now();
    const entry = requestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return next();
    }

    entry.count++;
    if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json({ error: "Too many requests" }, 429);
    }

    return next();
  };
}

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-api-key", "x-clanker-api-key"],
    credentials: true,
  }),
);

app.use("/trpc/*", rateLimiter());
app.use("/api/auth/*", rateLimiter());

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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
