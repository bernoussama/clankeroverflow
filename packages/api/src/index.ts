import { initTRPC, TRPCError } from "@trpc/server";

import { logTrpcProcedureLine, trpcErrorCode } from "./client-request-log";
import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

const requestLogMiddleware = t.middleware(async ({ ctx, path, input, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;
  if (result.ok) {
    logTrpcProcedureLine(ctx, path, input, durationMs, true);
    return result;
  }
  logTrpcProcedureLine(ctx, path, input, durationMs, false, trpcErrorCode(result.error));
  return result;
});

export const router = t.router;

export const publicProcedure = t.procedure.use(requestLogMiddleware);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});
