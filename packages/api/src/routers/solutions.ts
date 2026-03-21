import { TRPCError } from "@trpc/server";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { hashApiKey } from "@clankeroverflow/auth/api-keys";
import { publicProcedure, router } from "../index";
import { schema, type Database } from "@clankeroverflow/db";
import { searchSolutions } from "@clankeroverflow/db/search";
import { withTimeout } from "../utils/withTimeout";

async function getVoteCounts(db: Database, solutionId: string, userId: string | null) {
  const [counts] = await db
    .select({
      upvotes: sql<number>`count(*) filter (where ${schema.solutionVote.isUpvote} = true)`.mapWith(Number),
      downvotes: sql<number>`count(*) filter (where ${schema.solutionVote.isUpvote} = false)`.mapWith(Number),
    })
    .from(schema.solutionVote)
    .where(eq(schema.solutionVote.solutionId, solutionId));

  let userVote: boolean | null = null;
  if (userId) {
    const existing = await db.query.solutionVote.findFirst({
      where: and(
        eq(schema.solutionVote.userId, userId),
        eq(schema.solutionVote.solutionId, solutionId),
      ),
    });
    userVote = existing?.isUpvote ?? null;
  }

  return {
    upvotes: counts?.upvotes ?? 0,
    downvotes: counts?.downvotes ?? 0,
    userVote,
  };
}

export const solutionsRouter = router({
  vote: publicProcedure
    .input(
      z.object({
        id: z.string().min(1, "Solution ID is required"),
        isUpvote: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      let userId: string | null = null;

      if (ctx.session?.user) {
        userId = ctx.session.user.id;
      } else if (ctx.apiKey) {
        const apiKeyHash = await hashApiKey(ctx.apiKey);
        const keyRecord = await withTimeout(
          db.query.apiKey.findFirst({
            where: eq(schema.apiKey.key, apiKeyHash),
          }),
          2500,
          "API key lookup timed out",
        );

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

      const solutionRecord = await withTimeout(
        db.query.solution.findFirst({
          where: eq(schema.solution.id, input.id),
        }),
        2500,
        "Solution lookup timed out",
      );

      if (!solutionRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Solution not found",
        });
      }

      const existingVote = await withTimeout(
        db.query.solutionVote.findFirst({
          where: and(
            eq(schema.solutionVote.userId, userId),
            eq(schema.solutionVote.solutionId, input.id)
          ),
        }),
        2500,
        "Existing vote lookup timed out",
      );

      let scoreDiff = 0;

      if (existingVote) {
        if (existingVote.isUpvote === input.isUpvote) {
          // Toggle off
          await withTimeout(
            db.delete(schema.solutionVote).where(
              and(
                eq(schema.solutionVote.userId, userId),
                eq(schema.solutionVote.solutionId, input.id)
              )
            ),
            2500,
            "Vote delete timed out",
          );
          scoreDiff = input.isUpvote ? -1 : 1;
        } else {
          // Flip vote
          await withTimeout(
            db.update(schema.solutionVote)
              .set({ isUpvote: input.isUpvote })
              .where(
                and(
                  eq(schema.solutionVote.userId, userId),
                  eq(schema.solutionVote.solutionId, input.id)
                )
              ),
            2500,
            "Vote update timed out",
          );
          scoreDiff = input.isUpvote ? 2 : -2;
        }
      } else {
        // New vote
        await withTimeout(
          db.insert(schema.solutionVote).values({
            userId,
            solutionId: input.id,
            isUpvote: input.isUpvote,
          }),
          2500,
          "Vote insert timed out",
        );
        scoreDiff = input.isUpvote ? 1 : -1;
      }

      if (scoreDiff !== 0) {
        await withTimeout(
          db.update(schema.solution)
            .set({ score: sql`${schema.solution.score} + ${scoreDiff}` })
            .where(eq(schema.solution.id, input.id)),
          2500,
          "Score update timed out",
        );
      }

      const voteCounts = await withTimeout(
        getVoteCounts(db, input.id, userId),
        2500,
        "Vote counts lookup timed out",
      );

      return { success: true, ...voteCounts };
    }),

  log: publicProcedure
    .input(
      z.object({
        problem: z.string().trim().min(1, "Problem description is required").max(300),
        solution: z.string().trim().min(1, "Solution details are required").max(30_000),
        tags: z.string().trim().max(250).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      let userId: string | null = null;

      // If they provided a session, use it
      if (ctx.session?.user) {
        userId = ctx.session.user.id;
      } else if (ctx.apiKey) {
        const apiKeyHash = await hashApiKey(ctx.apiKey);
        const keyRecord = await withTimeout(
          db.query.apiKey.findFirst({
            where: eq(schema.apiKey.key, apiKeyHash),
          }),
          2500,
          "API key lookup timed out",
        );

        if (!keyRecord) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid API Key provided",
          });
        }
        userId = keyRecord.userId;
      }

      const id = crypto.randomUUID();
      await withTimeout(
        db.insert(schema.solution).values({
          id,
          problem: input.problem,
          solution: input.solution,
          tags: input.tags ?? null,
          userId,
        }),
        2500,
        "Solution insert timed out",
      );

      return { id };
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1, "Search query is required"),
        limit: z.number().min(1).max(20).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const results = await withTimeout(
        searchSolutions(ctx.db, input),
        2500,
        "Solution search timed out",
      );

      return results;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const result = await withTimeout(
        db.query.solution.findFirst({
          where: eq(schema.solution.id, input.id),
        }),
        2500,
        "Solution lookup timed out",
      );

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Solution not found",
        });
      }

      let userId: string | null = null;
      if (ctx.session?.user) {
        userId = ctx.session.user.id;
      }

      const voteCounts = await withTimeout(
        getVoteCounts(db, input.id, userId),
        2500,
        "Vote counts lookup timed out",
      );

      return { ...result, ...voteCounts };
    }),
});
