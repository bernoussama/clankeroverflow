import { TRPCError } from "@trpc/server";
import { eq, like, or } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "../index";
import { db, schema } from "@clankeroverflow/db";

export const solutionsRouter = router({
  log: publicProcedure
    .input(
      z.object({
        problem: z.string().min(1, "Problem description is required"),
        solution: z.string().min(1, "Solution details are required"),
        tags: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let userId: string | null = null;

      // If they provided a session, use it
      if (ctx.session?.user) {
        userId = ctx.session.user.id;
      } else if (ctx.apiKey) {
        // Validate API key
        const keyRecord = await db.query.apiKey.findFirst({
          where: eq(schema.apiKey.key, ctx.apiKey),
        });

        if (!keyRecord) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid API Key provided",
          });
        }
        userId = keyRecord.userId;
      }

      const id = crypto.randomUUID();
      await db.insert(schema.solution).values({
        id,
        problem: input.problem,
        solution: input.solution,
        tags: input.tags ?? null,
        userId,
      });

      return { id };
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1, "Search query is required"),
        limit: z.number().min(1).max(20).default(1),
      })
    )
    .query(async ({ input }) => {
      // In SQLite without FTS we can just use basic ILIKE search with `%query%`
      const searchTerm = `%${input.query}%`;
      
      const results = await db.query.solution.findMany({
        where: or(
          like(schema.solution.problem, searchTerm),
          like(schema.solution.solution, searchTerm),
          like(schema.solution.tags, searchTerm)
        ),
        limit: input.limit,
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      });

      return results;
    }),
});
