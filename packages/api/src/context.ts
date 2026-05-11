import type { Context as HonoContext } from "hono";

import type { Auth } from "@clankeroverflow/auth";
import type { Database } from "@clankeroverflow/db";

import type { WorkersAiBinding } from "./semantic/embeddings";
import type { PostHogClient } from "./posthog";
import type { SolutionVectorizeBinding } from "./semantic/search";

/** Bindings read from `c.env` on the API worker (see wrangler / Alchemy). */
type ApiWorkerEnv = {
  AI?: WorkersAiBinding;
  SOLUTION_VECTORS?: SolutionVectorizeBinding;
};

function getRequestIdentity(headers: Headers) {
  const forwardedFor = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();
  return firstForwardedIp ? `ip:${firstForwardedIp}` : "ip:unknown";
}

export type CreateContextOptions = {
  context: HonoContext;
};

type VerifiedApiKey = Exclude<
  Awaited<ReturnType<Auth["api"]["verifyApiKey"]>>["key"],
  null
>;

function getWaitUntil(context: HonoContext): ((p: Promise<unknown>) => void) | undefined {
  try {
    const exec = (context as { executionCtx?: { waitUntil?: (p: Promise<unknown>) => void } })
      .executionCtx;
    if (exec && typeof exec.waitUntil === "function") {
      return exec.waitUntil.bind(exec);
    }
  } catch {
    // Hono throws when ExecutionContext is missing (e.g. plain Bun/Node tests).
  }
  return undefined;
}

export async function createContext({ context }: CreateContextOptions) {
  const cookieHeader = context.req.raw.headers.get("cookie");
  const hasAuthContext = Boolean(cookieHeader);
  const apiKeyHeader = context.req.raw.headers.get("x-clanker-api-key");
  const auth = context.get("auth") as Auth;
  const db = context.get("db") as Database;
  const posthog = context.get("posthog") as PostHogClient | undefined;
  const env = (context as { env?: ApiWorkerEnv }).env;

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

  const ai = env?.AI as WorkersAiBinding | undefined;
  const solutionVectors = env?.SOLUTION_VECTORS as SolutionVectorizeBinding | undefined;

  if (session?.user) {
    posthog?.identify({
      distinctId: session.user.id,
      properties: {
        email: session.user.email,
        name: session.user.name,
      },
    });
  }

  return {
    auth,
    db,
    posthog,
    session,
    apiKey: (verifiedApiKey?.valid ? verifiedApiKey.key : null) as VerifiedApiKey | null,
    env,
    ai,
    solutionVectors,
    waitUntil: getWaitUntil(context),
    requestIdentity: getRequestIdentity(context.req.raw.headers),
  };
}

/** tRPC context; `ai` / `solutionVectors` / `waitUntil` are only set on the Cloudflare Worker. */
export type Context = {
  auth: Auth;
  db: Database;
  posthog?: PostHogClient;
  session: Awaited<ReturnType<Auth["api"]["getSession"]>>;
  apiKey: VerifiedApiKey | null;
  env?: ApiWorkerEnv;
  ai?: WorkersAiBinding;
  solutionVectors?: SolutionVectorizeBinding;
  waitUntil?: (p: Promise<unknown>) => void;
  requestIdentity?: string;
};
