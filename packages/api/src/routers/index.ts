import { protectedProcedure, publicProcedure, router } from "../index";
import { solutionsRouter } from "./solutions";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const cliAuthRouter = router({
  exchangeDeviceToken: publicProcedure
    .input(
      z.object({
        accessToken: z.string().min(1),
        clientName: z.string().trim().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.auth.api.getSession({
        headers: {
          authorization: `Bearer ${input.accessToken}`,
        },
      });

      if (!session?.user?.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or expired device authorization token",
        });
      }

      const name = input.clientName?.trim() || "CLI setup";
      const created = await ctx.auth.api.createApiKey({
        body: {
          name,
          userId: session.user.id,
        },
      });

      return {
        key: created.key,
        id: created.id,
        name: created.name,
        start: created.start,
        prefix: created.prefix,
      };
    }),
});

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  apiKeyCheck: publicProcedure.query(({ ctx }) => {
    return Boolean(ctx.apiKey);
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  cliAuth: cliAuthRouter,
  solutions: solutionsRouter,
});
export type AppRouter = typeof appRouter;
