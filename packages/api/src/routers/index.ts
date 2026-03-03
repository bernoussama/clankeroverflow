import { protectedProcedure, publicProcedure, router } from "../index";
import { solutionsRouter } from "./solutions";
import { apiKeysRouter } from "./apiKeys";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  solutions: solutionsRouter,
  apiKeys: apiKeysRouter,
});
export type AppRouter = typeof appRouter;
