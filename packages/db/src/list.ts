import { and, desc, eq, lt, or } from "drizzle-orm";

import type { getDb } from "./index";
import * as schema from "./schema";

type Database = ReturnType<typeof getDb>;
type SolutionRow = Omit<typeof schema.solution.$inferSelect, "updatedAt">;

const solutionListColumns = {
  id: schema.solution.id,
  problem: schema.solution.problem,
  solution: schema.solution.solution,
  tags: schema.solution.tags,
  userId: schema.solution.userId,
  score: schema.solution.score,
  createdAt: schema.solution.createdAt,
};

export type SolutionListCursor = {
  createdAt: string;
  id: string;
  score: number;
};

export type SolutionListSort = "recent" | "top";

export async function listSolutions(
  db: Database,
  input: { limit: number; cursor?: SolutionListCursor | null; sort?: SolutionListSort },
): Promise<{ items: SolutionRow[]; nextCursor: SolutionListCursor | null }> {
  const limit = Math.min(Math.max(input.limit, 1), 50);
  const sort = input.sort ?? "recent";

  let where;
  if (input.cursor) {
    const cursorCreatedAt = new Date(input.cursor.createdAt);

    where =
      sort === "top"
        ? or(
            lt(schema.solution.score, input.cursor.score),
            and(
              eq(schema.solution.score, input.cursor.score),
              lt(schema.solution.createdAt, cursorCreatedAt),
            ),
            and(
              eq(schema.solution.score, input.cursor.score),
              eq(schema.solution.createdAt, cursorCreatedAt),
              lt(schema.solution.id, input.cursor.id),
            ),
          )
        : or(
            lt(schema.solution.createdAt, cursorCreatedAt),
            and(
              eq(schema.solution.createdAt, cursorCreatedAt),
              lt(schema.solution.id, input.cursor.id),
            ),
          );
  }

  const orderBy =
    sort === "top"
      ? [desc(schema.solution.score), desc(schema.solution.createdAt), desc(schema.solution.id)]
      : [desc(schema.solution.createdAt), desc(schema.solution.id)];

  const rows = await db
    .select(solutionListColumns)
    .from(schema.solution)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit + 1);

  let nextCursor: SolutionListCursor | null = null;
  if (rows.length > limit) {
    const last = rows[limit - 1];
    if (last) {
      nextCursor = {
        createdAt: last.createdAt.toISOString(),
        id: last.id,
        score: last.score,
      };
    }
  }

  return { items: rows.slice(0, limit), nextCursor };
}
