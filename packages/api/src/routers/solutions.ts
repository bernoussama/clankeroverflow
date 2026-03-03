import { TRPCError } from "@trpc/server";
import { eq, like, or, and } from "drizzle-orm";
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
      // Split the search query into individual words for broader matching
      const searchTerms = input.query
        .trim()
        .split(/\s+/)
        .filter((term) => term.length > 0)
        .map((term) => `%${term}%`);

      if (searchTerms.length === 0) return [];
      
      const conditions = searchTerms.map((term) =>
        or(
          like(schema.solution.problem, term),
          like(schema.solution.solution, term),
          like(schema.solution.tags, term)
        )
      );

      const results = await db.query.solution.findMany({
        where: and(...conditions),
        limit: input.limit,
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      });

      return results;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const result = await db.query.solution.findFirst({
        where: eq(schema.solution.id, input.id),
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Solution not found",
        });
      }

      return result;
    }),
});
