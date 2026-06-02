import { sql } from "drizzle-orm";

import type { getDb } from "./index";
import type * as schema from "./schema";

type Database = ReturnType<typeof getDb>;
type SearchSolution = Omit<typeof schema.solution.$inferSelect, "updatedAt">;

/**
 * Indexed tsvector expression — must match migration 0002
 * (solution_search_vector_idx) exactly so the GIN index is used.
 */
const TEXT_VECTOR = sql`to_tsvector('simple', btrim(regexp_replace(lower(
  coalesce("problem", '') || ' ' || coalesce("solution", '') || ' ' || coalesce("tags", '')
), '[^a-z0-9]+', ' ', 'g')))`;

/**
 * Indexed trigram expression — must match migration 0002
 * (solution_search_trgm_idx) exactly so the GIN index is used.
 */
const TRIGRAM_TEXT = sql`(regexp_replace(lower(
  coalesce("problem", '') || coalesce("solution", '') || coalesce("tags", '')
), '[^a-z0-9]+', '', 'g'))`;

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactQuery(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isMissingPgTrgm(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("pg_trgm") || msg.includes("gin_trgm_ops") || msg.includes("<%");
}

export async function searchSolutions(
  db: Database,
  input: { query: string; limit: number },
): Promise<SearchSolution[]> {
  const normalized = normalizeQuery(input.query);
  if (!normalized) return [];

  const compact = compactQuery(input.query);
  const tsquery = sql`websearch_to_tsquery('simple', ${normalized})`;

  try {
    // Full-text search + trigram fuzzy matching (both use GIN indexes)
    const { rows } = await db.execute<SearchSolution>(sql`
      SELECT "id", "problem", "solution", "tags",
             "user_id" AS "userId", "score",
             "created_at" AS "createdAt"
      FROM "solution"
      WHERE ${TEXT_VECTOR} @@ ${tsquery}
         OR ${compact} <% ${TRIGRAM_TEXT}
      ORDER BY
        ts_rank(${TEXT_VECTOR}, ${tsquery}) DESC,
        "score" DESC,
        "created_at" DESC
      LIMIT ${input.limit}
    `);
    return rows;
  } catch (error) {
    if (!isMissingPgTrgm(error)) throw error;

    // Fallback: full-text search only (pg_trgm unavailable)
    const { rows } = await db.execute<SearchSolution>(sql`
      SELECT "id", "problem", "solution", "tags",
             "user_id" AS "userId", "score",
             "created_at" AS "createdAt"
      FROM "solution"
      WHERE ${TEXT_VECTOR} @@ ${tsquery}
      ORDER BY
        ts_rank(${TEXT_VECTOR}, ${tsquery}) DESC,
        "score" DESC,
        "created_at" DESC
      LIMIT ${input.limit}
    `);
    return rows;
  }
}
