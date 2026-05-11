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
import { publicProcedure, router } from "../index";
import { assertRateLimit } from "../rate-limit";
import {
  searchSolutionsHybrid,
  searchSolutionsSemantic,
  upsertSolutionVector,
} from "../semantic/search";
import { DB_TIMEOUT_MS, withTimeout } from "../utils/withTimeout";

const SEARCH_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };
const ANONYMOUS_LOG_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };
const AUTHENTICATED_LOG_RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

function getAuthenticatedUserId(ctx: {
  session: { user: { id: string } } | null;
  apiKey: { referenceId: string } | null;
}) {
  return ctx.session?.user.id ?? ctx.apiKey?.referenceId ?? null;
}

function getRateLimitIdentity(ctx: {
  session: { user: { id: string } } | null;
  apiKey: { id?: string; referenceId: string } | null;
  requestIdentity?: string;
}) {
  if (ctx.session?.user.id) return `user:${ctx.session.user.id}`;
  if (ctx.apiKey?.id) return `api-key:${ctx.apiKey.id}`;
  if (ctx.apiKey?.referenceId) return `api-key-user:${ctx.apiKey.referenceId}`;
  return ctx.requestIdentity ?? "ip:unknown";
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
        and(eq(schema.solutionVote.userId, userId), eq(schema.solutionVote.solutionId, solutionId)),
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
        db.select().from(schema.solution).where(eq(schema.solution.id, input.id)).limit(1),
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

        let voteAction: "added" | "removed" | "changed";

        if (existingVote) {
          if (existingVote.isUpvote === input.isUpvote) {
            const result = await withTimeout(
              db
                .delete(schema.solutionVote)
                .where(
                  and(
                    eq(schema.solutionVote.userId, userId),
                    eq(schema.solutionVote.solutionId, input.id),
                  ),
                )
                .returning(),
              DB_TIMEOUT_MS,
              "Vote delete timed out",
            );
            if (result.length === 0) {
              // Row was already deleted by a concurrent request; no-op
              const voteCounts = await withTimeout(
                getVoteCounts(db, input.id, userId),
                DB_TIMEOUT_MS,
                "Vote counts lookup timed out",
              );
              return { success: true, ...voteCounts };
            }
            voteAction = "removed";
          } else {
            const result = await withTimeout(
              db
                .update(schema.solutionVote)
                .set({ isUpvote: input.isUpvote })
                .where(
                  and(
                    eq(schema.solutionVote.userId, userId),
                    eq(schema.solutionVote.solutionId, input.id),
                  ),
                )
                .returning(),
              DB_TIMEOUT_MS,
              "Vote update timed out",
            );
            if (result.length === 0) {
              const voteCounts = await withTimeout(
                getVoteCounts(db, input.id, userId),
                DB_TIMEOUT_MS,
                "Vote counts lookup timed out",
              );
              return { success: true, ...voteCounts };
            }
            voteAction = "changed";
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
          voteAction = "added";
        }

        // Recompute score from actual votes to avoid race conditions
        const [voteAgg] = await withTimeout(
          db
            .select({
              score: sql<number>`coalesce(sum(case when ${schema.solutionVote.isUpvote} then 1 else -1 end), 0)`,
            })
            .from(schema.solutionVote)
            .where(eq(schema.solutionVote.solutionId, input.id)),
          DB_TIMEOUT_MS,
          "Vote recomputation timed out",
        );
        const recomputedScore = voteAgg?.score ?? 0;

        await withTimeout(
          db
            .update(schema.solution)
            .set({ score: recomputedScore })
            .where(eq(schema.solution.id, input.id)),
          DB_TIMEOUT_MS,
          "Score update timed out",
        );

        const voteCounts = await withTimeout(
          getVoteCounts(db, input.id, userId),
          DB_TIMEOUT_MS,
          "Vote counts lookup timed out",
        );

        ctx.posthog?.capture({
          distinctId: userId,
          event: "solution voted",
          properties: {
            solution_id: input.id,
            is_upvote: input.isUpvote,
            vote_action: voteAction,
          },
        });

        return { success: true, ...voteCounts };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("solutions.vote error:", error);
        ctx.posthog?.captureException(
          error instanceof Error ? error : new Error(String(error)),
          userId,
        );
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

      assertRateLimit({
        key: `solutions.log:${getRateLimitIdentity(ctx)}`,
        ...(userId ? AUTHENTICATED_LOG_RATE_LIMIT : ANONYMOUS_LOG_RATE_LIMIT),
      });

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

      const { ai, solutionVectors, waitUntil } = ctx;
      if (ai && solutionVectors && waitUntil) {
        waitUntil(
          upsertSolutionVector({
            ai,
            vectorize: solutionVectors,
            row: {
              id,
              problem: input.problem,
              solution: input.solution,
              tags: input.tags ?? null,
            },
          }).catch((err) => {
            console.error("solution vector upsert failed:", err);
          }),
        );
      }

      ctx.posthog?.capture({
        distinctId: userId ?? "anonymous",
        event: "solution logged",
        properties: {
          solution_id: id,
          has_tags: Boolean(input.tags),
          user_type: ctx.session ? "session" : ctx.apiKey ? "api_key" : "anonymous",
        },
      });

      return { id };
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1, "Search query is required").max(500, "Search query too long"),
        limit: z.number().min(1).max(20).default(1),
        mode: z.enum(["keyword", "semantic", "hybrid"]).default("keyword"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const trimmed = input.query.trim();
      if (!trimmed) {
        return [];
      }

      const payload = { query: trimmed, limit: input.limit };
      const userId = getAuthenticatedUserId(ctx);
      const distinctId = userId ?? "anonymous";

      assertRateLimit({
        key: `solutions.search:${input.mode}:${getRateLimitIdentity(ctx)}`,
        ...SEARCH_RATE_LIMIT,
      });

      let results: Awaited<ReturnType<typeof searchSolutions>>;

      if (input.mode === "keyword") {
        results = await withTimeout(
          searchSolutions(ctx.db, payload),
          DB_TIMEOUT_MS,
          "Solution search timed out",
        );
      } else {
        // Require authentication for semantic/hybrid modes to prevent abuse
        if (!getAuthenticatedUserId(ctx)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Authentication required for semantic and hybrid search. Provide a valid session cookie or API key.",
          });
        }

        if (!ctx.ai || !ctx.solutionVectors) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Semantic search is not configured on this server (missing Workers AI or Vectorize binding).",
          });
        }

        if (input.mode === "semantic") {
          results = await withTimeout(
            searchSolutionsSemantic({
              db: ctx.db,
              ai: ctx.ai,
              vectorize: ctx.solutionVectors,
              ...payload,
            }),
            DB_TIMEOUT_MS,
            "Semantic solution search timed out",
          );
        } else {
          results = await withTimeout(
            searchSolutionsHybrid({
              db: ctx.db,
              ai: ctx.ai,
              vectorize: ctx.solutionVectors,
              ...payload,
            }),
            DB_TIMEOUT_MS,
            "Hybrid solution search timed out",
          );
        }
      }

      ctx.posthog?.capture({
        distinctId,
        event: "solution searched",
        properties: {
          search_mode: input.mode,
          query_length: trimmed.length,
          result_count: results.length,
        },
      });

      return results;
    }),

  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const db = ctx.db;
    const [result] = await withTimeout(
      db.select().from(schema.solution).where(eq(schema.solution.id, input.id)).limit(1),
      DB_TIMEOUT_MS,
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
      DB_TIMEOUT_MS,
      "Vote counts lookup timed out",
    );

    ctx.posthog?.capture({
      distinctId: userId ?? "anonymous",
      event: "solution viewed",
      properties: {
        solution_id: input.id,
        has_tags: Boolean(result.tags),
      },
    });

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

      const results = await withTimeout(
        listSolutions(ctx.db, { limit: input.limit, cursor, sort }),
        DB_TIMEOUT_MS,
        "Solution list timed out",
      );

      const distinctId = getAuthenticatedUserId(ctx) ?? "anonymous";
      ctx.posthog?.capture({
        distinctId,
        event: "solution list viewed",
        properties: {
          sort,
          result_count: results.items.length,
          is_paginated: Boolean(input.cursor),
        },
      });

      return results;
    }),
});
