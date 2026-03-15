import { TRPCError } from "@trpc/server";
import { eq, like, or, and, sql } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "../index";
import { db, schema } from "@clankeroverflow/db";
import { hashApiKey } from "../hash";

async function resolveUserId(ctx: { session: any; apiKey: string | null }): Promise<string | null> {
  if (ctx.session?.user) {
    return ctx.session.user.id;
  }
  if (ctx.apiKey) {
    const keyHash = await hashApiKey(ctx.apiKey);
    const keyRecord = await db.query.apiKey.findFirst({
      where: eq(schema.apiKey.key, keyHash),
    });
    if (!keyRecord) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid API Key provided",
      });
    }
    return keyRecord.userId;
  }
  return null;
}

async function recomputeScore(solutionId: string) {
  const [result] = await db
    .select({
      score: sql<number>`coalesce(sum(case when ${schema.solutionVote.isUpvote} = 1 then 1 else -1 end), 0)`,
    })
    .from(schema.solutionVote)
    .where(eq(schema.solutionVote.solutionId, solutionId));

  await db
    .update(schema.solution)
    .set({ score: result?.score ?? 0 })
    .where(eq(schema.solution.id, solutionId));
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
      const userId = await resolveUserId(ctx);

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

      if (existingVote) {
        if (existingVote.isUpvote === input.isUpvote) {
          await db.delete(schema.solutionVote).where(
            and(
              eq(schema.solutionVote.userId, userId),
              eq(schema.solutionVote.solutionId, input.id)
            )
          );
        } else {
          await db.update(schema.solutionVote)
            .set({ isUpvote: input.isUpvote })
            .where(
              and(
                eq(schema.solutionVote.userId, userId),
                eq(schema.solutionVote.solutionId, input.id)
              )
            );
        }
      } else {
        await db.insert(schema.solutionVote).values({
          userId,
          solutionId: input.id,
          isUpvote: input.isUpvote,
        });
      }

      await recomputeScore(input.id);

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
      const userId = await resolveUserId(ctx);

      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in or provide a valid API key to log solutions",
        });
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

  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(20),
      })
    )
    .query(async ({ input }) => {
      return db.query.solution.findMany({
        limit: input.limit,
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      });
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
