import type { Context as HonoContext } from "hono";

import type { Auth } from "@clankeroverflow/auth";
import type { Database } from "@clankeroverflow/db";

export type CreateContextOptions = {
  context: HonoContext;
};

type VerifiedApiKey = Exclude<
  Awaited<ReturnType<Auth["api"]["verifyApiKey"]>>["key"],
  null
>;

export async function createContext({ context }: CreateContextOptions) {
  const cookieHeader = context.req.raw.headers.get("cookie");
  const hasAuthContext = Boolean(cookieHeader);
  const apiKeyHeader = context.req.raw.headers.get("x-clanker-api-key");
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

  const verifiedApiKey = apiKeyHeader
    ? await auth.api.verifyApiKey({
        body: {
          key: apiKeyHeader,
        },
      })
    : null;

  return {
    auth,
    db,
    session,
    apiKey: (verifiedApiKey?.valid ? verifiedApiKey.key : null) as VerifiedApiKey | null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
