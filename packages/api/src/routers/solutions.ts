import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";

const closed = () => {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "The public solution corpus has been shut down. Use the team knowledge base.",
  });
};

export const solutionsRouter = router({
  vote: publicProcedure.input(z.object({ id: z.string(), isUpvote: z.boolean() })).mutation(closed),
  log: publicProcedure
    .input(z.object({ problem: z.string(), solution: z.string(), tags: z.string().optional() }))
    .mutation(closed),
  search: publicProcedure.input(z.object({ query: z.string() }).passthrough()).query(closed),
  getById: publicProcedure.input(z.object({ id: z.string() })).query(closed),
  list: publicProcedure.input(z.object({}).passthrough()).query(closed),
});
