import type { Context as HonoContext } from "hono";

import { getAuth } from "@clankeroverflow/auth";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const cookieHeader = context.req.raw.headers.get("cookie");
  const hasAuthContext = Boolean(cookieHeader);

  const session = hasAuthContext
    ? await getAuth().api.getSession({
        headers: context.req.raw.headers,
      })
    : null;
  
  const apiKey = context.req.raw.headers.get("x-clanker-api-key");

  return {
    session,
    apiKey,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
