import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Database } from "@clankeroverflow/db";
import {
  listSolutions,
  type SolutionListCursor,
  type SolutionListSort,
} from "@clankeroverflow/db/list";
import { searchSolutions } from "@clankeroverflow/db/search";
import type { CachedSolutionRow } from "../cache/solution-kv";
import {
  bumpSolutionListCacheVersion,
  getSolutionListCacheVersion,
  invalidateSolutionDetailCache,
  kvGetJson,
  kvPutJson,
  reviveSolutionRow,
  serializeSolutionRow,
  solutionDetailCacheKey,
  solutionListCacheKey,
  solutionSearchCacheKey,
} from "../cache/solution-kv";
import { publicProcedure, router } from "../index";
import { DB_TIMEOUT_MS, withTimeout } from "../utils/withTimeout";

function getAuthenticatedUserId(ctx: {
  session: { user: { id: string } } | null;
  apiKey: { referenceId: string } | null;
}) {
  return ctx.session?.user.id ?? ctx.apiKey?.referenceId ?? null;
}

async function getVoteCounts(db: Database, solutionId: string, userId: string | null) {
  const [counts] = await db
    .select({
      upvotes: sql<number>`count(*) filter (where ${schema.solutionVote.isUpvote} = true)`.mapWith(
        Number,
      ),
      downvotes:
        sql<number>`count(*) filter (where ${schema.solutionVote.isUpvote} = false)`.mapWith(
          Number,
        ),
    })
    .from(schema.solutionVote)
    .where(eq(schema.solutionVote.solutionId, solutionId));

  let userVote: boolean | null = null;
  if (userId) {
    const [existing] = await db
      .select({ isUpvote: schema.solutionVote.isUpvote })
      .from(schema.solutionVote)
      .where(
        and(
          eq(schema.solutionVote.userId, userId),
          eq(schema.solutionVote.solutionId, solutionId),
        ),
      )
      .limit(1);
    userVote = existing?.isUpvote ?? null;
  }

  return {
    upvotes: counts?.upvotes ?? 0,
    downvotes: counts?.downvotes ?? 0,
    userVote,
  };
}

async function getUserVote(
  db: Database,
  solutionId: string,
  userId: string,
): Promise<boolean | null> {
  const [existing] = await withTimeout(
    db
      .select({ isUpvote: schema.solutionVote.isUpvote })
      .from(schema.solutionVote)
      .where(
        and(eq(schema.solutionVote.userId, userId), eq(schema.solutionVote.solutionId, solutionId)),
      )
      .limit(1),
    DB_TIMEOUT_MS,
    "User vote lookup timed out",
  );
  return existing?.isUpvote ?? null;
}

export const solutionsRouter = router({
  vote: publicProcedure
    .input(
      z.object({
        id: z.string().min(1, "Solution ID is required"),
        isUpvote: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const userId = getAuthenticatedUserId(ctx);

      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in or provide a valid API key to vote",
        });
      }

      const [solutionRecord] = await withTimeout(
        db
          .select()
          .from(schema.solution)
          .where(eq(schema.solution.id, input.id))
          .limit(1),
        DB_TIMEOUT_MS,
        "Solution lookup timed out",
      );

      if (!solutionRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Solution not found",
        });
      }

      try {
        const [existingVote] = await withTimeout(
          db
            .select()
            .from(schema.solutionVote)
            .where(
              and(
                eq(schema.solutionVote.userId, userId),
                eq(schema.solutionVote.solutionId, input.id),
              ),
            )
            .limit(1),
          DB_TIMEOUT_MS,
          "Existing vote lookup timed out",
        );

        let scoreDiff = 0;

        if (existingVote) {
          if (existingVote.isUpvote === input.isUpvote) {
            await withTimeout(
              db
                .delete(schema.solutionVote)
                .where(
                  and(
                    eq(schema.solutionVote.userId, userId),
                    eq(schema.solutionVote.solutionId, input.id),
                  ),
                ),
              DB_TIMEOUT_MS,
              "Vote delete timed out",
            );
            scoreDiff = input.isUpvote ? -1 : 1;
          } else {
            await withTimeout(
              db
                .update(schema.solutionVote)
                .set({ isUpvote: input.isUpvote })
                .where(
                  and(
                    eq(schema.solutionVote.userId, userId),
                    eq(schema.solutionVote.solutionId, input.id),
                  ),
                ),
              DB_TIMEOUT_MS,
              "Vote update timed out",
            );
            scoreDiff = input.isUpvote ? 2 : -2;
          }
        } else {
          await withTimeout(
            db.insert(schema.solutionVote).values({
              userId,
              solutionId: input.id,
              isUpvote: input.isUpvote,
              createdAt: new Date(),
            }),
            DB_TIMEOUT_MS,
            "Vote insert timed out",
          );
          scoreDiff = input.isUpvote ? 1 : -1;
        }

        if (scoreDiff !== 0) {
          await withTimeout(
            db
              .update(schema.solution)
              .set({ score: sql`${schema.solution.score} + ${scoreDiff}` })
              .where(eq(schema.solution.id, input.id)),
            DB_TIMEOUT_MS,
            "Score update timed out",
          );
        }

        const voteCounts = await withTimeout(
          getVoteCounts(db, input.id, userId),
          DB_TIMEOUT_MS,
          "Vote counts lookup timed out",
        );

        const kv = ctx.solutionsKv;
        if (kv) {
          await bumpSolutionListCacheVersion(kv);
          await invalidateSolutionDetailCache(kv, input.id);
        }

        return { success: true, ...voteCounts };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("solutions.vote error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to record vote",
          cause: error,
        });
      }
    }),

  log: publicProcedure
    .input(
      z.object({
        problem: z.string().trim().min(1, "Problem description is required").max(300),
        solution: z.string().trim().min(1, "Solution details are required").max(30_000),
        tags: z.string().trim().max(250).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const userId = getAuthenticatedUserId(ctx);

      const id = crypto.randomUUID();
      const now = new Date();
      await withTimeout(
        db.insert(schema.solution).values({
          id,
          problem: input.problem,
          solution: input.solution,
          tags: input.tags ?? null,
          userId,
          score: 0,
          createdAt: now,
          updatedAt: now,
        }),
        DB_TIMEOUT_MS,
        "Solution insert timed out",
      );

      const kv = ctx.solutionsKv;
      if (kv) {
        await bumpSolutionListCacheVersion(kv);
      }

      return { id };
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1, "Search query is required"),
        limit: z.number().min(1).max(20).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const kv = ctx.solutionsKv;
      if (kv) {
        const lv = await getSolutionListCacheVersion(kv);
        const key = solutionSearchCacheKey(lv, input.query, input.limit);
        const cached = await kvGetJson<CachedSolutionRow[]>(kv, key);
        if (cached) {
          return cached.map(reviveSolutionRow);
        }
      }

      const results = await withTimeout(
        searchSolutions(ctx.db, input),
        DB_TIMEOUT_MS,
        "Solution search timed out",
      );

      if (kv) {
        const lv = await getSolutionListCacheVersion(kv);
        const key = solutionSearchCacheKey(lv, input.query, input.limit);
        await kvPutJson(kv, key, results.map(serializeSolutionRow));
      }

      return results;
    }),

  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const db = ctx.db;
    const kv = ctx.solutionsKv;
    const detailKey = kv ? solutionDetailCacheKey(input.id) : null;

    type DetailPayload = {
      row: CachedSolutionRow;
      upvotes: number;
      downvotes: number;
    };

    if (kv && detailKey) {
      const cached = await kvGetJson<DetailPayload>(kv, detailKey);
      if (cached) {
        const row = reviveSolutionRow(cached.row);
        let userVote: boolean | null = null;
        const userId = ctx.session?.user.id ?? null;
        if (userId) {
          userVote = await getUserVote(db, input.id, userId);
        }
        return { ...row, upvotes: cached.upvotes, downvotes: cached.downvotes, userVote };
      }
    }

    const [result] = await withTimeout(
      db
        .select()
        .from(schema.solution)
        .where(eq(schema.solution.id, input.id))
        .limit(1),
      DB_TIMEOUT_MS,
      "Solution lookup timed out",
    );

    if (!result) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Solution not found",
      });
    }

    const userId = ctx.session?.user.id ?? null;
    const voteCounts = await withTimeout(
      getVoteCounts(db, input.id, userId),
      DB_TIMEOUT_MS,
      "Vote counts lookup timed out",
    );

    if (kv && detailKey) {
      await kvPutJson(kv, detailKey, {
        row: serializeSolutionRow(result),
        upvotes: voteCounts.upvotes,
        downvotes: voteCounts.downvotes,
      });
    }

    return { ...result, ...voteCounts };
  }),

  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z
          .object({
            createdAt: z.string(),
            id: z.string(),
            score: z.number(),
          })
          .nullish(),
        sort: z.enum(["recent", "top"]).default("recent"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cursor: SolutionListCursor | null = input.cursor ?? null;
      const sort: SolutionListSort = input.sort;
      const kv = ctx.solutionsKv;

      if (kv) {
        const lv = await getSolutionListCacheVersion(kv);
        const key = solutionListCacheKey(lv, sort, cursor, input.limit);
        const cached = await kvGetJson<{
          items: CachedSolutionRow[];
          nextCursor: SolutionListCursor | null;
        }>(kv, key);
        if (cached) {
          return {
            items: cached.items.map(reviveSolutionRow),
            nextCursor: cached.nextCursor,
          };
        }
      }

      const page = await withTimeout(
        listSolutions(ctx.db, { limit: input.limit, cursor, sort }),
        DB_TIMEOUT_MS,
        "Solution list timed out",
      );

      if (kv) {
        const lv = await getSolutionListCacheVersion(kv);
        const key = solutionListCacheKey(lv, sort, cursor, input.limit);
        await kvPutJson(kv, key, {
          items: page.items.map(serializeSolutionRow),
          nextCursor: page.nextCursor,
        });
      }

      return page;
    }),
});
