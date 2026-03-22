import type { Context as HonoContext } from "hono";

import type { Auth } from "@clankeroverflow/auth";
import type { Database } from "@clankeroverflow/db";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const cookieHeader = context.req.raw.headers.get("cookie");
  const hasAuthContext = Boolean(cookieHeader);
  const auth = context.get("auth") as Auth;
  const db = context.get("db") as Database;

  let session = null;

  if (hasAuthContext) {
    try {
      session = await auth.api.getSession({
        headers: {
          cookie: cookieHeader ?? "",
        },
      });
    } catch {
      session = null;
    }
  }

  const apiKey = context.req.raw.headers.get("x-clanker-api-key");

  return {
    auth,
    db,
    session,
    apiKey,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
