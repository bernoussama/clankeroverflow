import { createContext } from "@clankeroverflow/api/context";
import { appRouter } from "@clankeroverflow/api/routers/index";
import { createAuth, type Auth } from "@clankeroverflow/auth";
import { createDb, type Database } from "@clankeroverflow/db";
import { env } from "@clankeroverflow/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

type AppEnv = {
  Variables: {
    auth: Auth;
    db: Database;
  };
};

const app = new Hono<AppEnv>();

const withRequestServices: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { close, db } = await createDb();
  c.set("db", db);
  c.set("auth", createAuth(db));

  try {
    await next();
  } finally {
    await close();
  }
};

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use("/api/auth/*", withRequestServices);
app.on(["POST", "GET"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

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
