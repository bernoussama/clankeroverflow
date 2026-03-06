import { TRPCError } from "@trpc/server";
import { eq, like, or, and, sql } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "../index";
import { db, schema } from "@clankeroverflow/db";

export const solutionsRouter = router({
  vote: publicProcedure
    .input(
      z.object({
        id: z.string().min(1, "Solution ID is required"),
        isUpvote: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let userId: string | null = null;

      if (ctx.session?.user) {
        userId = ctx.session.user.id;
      } else if (ctx.apiKey) {
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

      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in or provide a valid API key to vote",
        });
      }

      const solutionRecord = await db.query.solution.findFirst({
        where: eq(schema.solution.id, input.id),
      });

      if (!solutionRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Solution not found",
        });
      }

      const existingVote = await db.query.solutionVote.findFirst({
        where: and(
          eq(schema.solutionVote.userId, userId),
          eq(schema.solutionVote.solutionId, input.id)
        ),
      });

      let scoreDiff = 0;

      if (existingVote) {
        if (existingVote.isUpvote === input.isUpvote) {
          // Toggle off
          await db.delete(schema.solutionVote).where(
            and(
              eq(schema.solutionVote.userId, userId),
              eq(schema.solutionVote.solutionId, input.id)
            )
          );
          scoreDiff = input.isUpvote ? -1 : 1;
        } else {
          // Flip vote
          await db.update(schema.solutionVote)
            .set({ isUpvote: input.isUpvote })
            .where(
              and(
                eq(schema.solutionVote.userId, userId),
                eq(schema.solutionVote.solutionId, input.id)
              )
            );
          scoreDiff = input.isUpvote ? 2 : -2;
        }
      } else {
        // New vote
        await db.insert(schema.solutionVote).values({
          userId,
          solutionId: input.id,
          isUpvote: input.isUpvote,
        });
        scoreDiff = input.isUpvote ? 1 : -1;
      }

      if (scoreDiff !== 0) {
        await db.update(schema.solution)
          .set({ score: sql`${schema.solution.score} + ${scoreDiff}` })
          .where(eq(schema.solution.id, input.id));
      }

      return { success: true };
    }),

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
