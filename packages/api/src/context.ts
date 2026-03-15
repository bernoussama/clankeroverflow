import type { Context as HonoContext } from "hono";

import { auth } from "@clankeroverflow/auth";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  
  const apiKey = context.req.raw.headers.get("x-api-key")
    ?? context.req.raw.headers.get("x-clanker-api-key");

  return {
    session,
    apiKey,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
