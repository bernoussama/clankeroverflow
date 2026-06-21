import { sql } from "drizzle-orm";

import type { getDb } from "./index";
import type * as schema from "./schema";

type Database = ReturnType<typeof getDb>;
type SearchSolution = Omit<typeof schema.solution.$inferSelect, "updatedAt">;
export type HostedKeywordStrategy = "exact" | "tiered";

/** Must match solution_search_vector_unicode_idx exactly. */
const SEARCH_TEXT = sql`lower(
  coalesce("problem", '') || ' ' || coalesce("solution", '') || ' ' || coalesce("tags", '')
)`;
const TEXT_VECTOR = sql`to_tsvector('simple', ${SEARCH_TEXT})`;

/** Must match solution_search_trgm_unicode_idx exactly. */
const TRIGRAM_TEXT = SEARCH_TEXT;

function exactQueryText(query: string) {
  return query.replace(/(^|\s)-+(?=\S)/gu, "$1").trim();
}

function relaxedQueryText(query: string) {
  const terms = query.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(terms.map((term) => term.toLowerCase()))]
    .map((term) => `${term}:*`)
    .join(" | ");
}

function isMissingPgTrgm(error: unknown): boolean {
  let current = error;
  while (current instanceof Error) {
    const message = current.message.toLowerCase();
    if (
      message.includes("pg_trgm") ||
      message.includes("gin_trgm_ops") ||
      message.includes("word_similarity") ||
      message.includes("<%")
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export async function searchSolutions(
  db: Database,
  input: { query: string; limit: number; strategy?: HostedKeywordStrategy },
): Promise<SearchSolution[]> {
  const exactText = exactQueryText(input.query);
  const relaxedText = relaxedQueryText(input.query);
  if (!exactText || !relaxedText) return [];

  const strategy = input.strategy ?? "exact";
  const strictQuery = sql`websearch_to_tsquery('simple', ${exactText})`;
  const relaxedQuery = sql`to_tsquery('simple', ${relaxedText})`;
  const candidateQuery = strategy === "exact" ? strictQuery : relaxedQuery;
  const normalized = exactText.toLowerCase();
  const candidatePredicate =
    strategy === "exact"
      ? sql`${TEXT_VECTOR} @@ ${strictQuery}`
      : sql`${TEXT_VECTOR} @@ ${relaxedQuery} OR ${normalized} <% ${TRIGRAM_TEXT}`;
  const similaritySetup =
    strategy === "tiered"
      ? sql`WITH search_settings AS MATERIALIZED (
          SELECT set_config('pg_trgm.word_similarity_threshold', '0.35', true)
        )`
      : sql``;
  const settingsJoin = strategy === "tiered" ? sql`, search_settings` : sql``;
  const similarityOrder =
    strategy === "tiered"
      ? sql`word_similarity(${normalized}, ${TRIGRAM_TEXT})`
      : sql`(NULL::real)`;

  try {
    const { rows } = await db.execute<SearchSolution>(sql`
      ${similaritySetup}
      SELECT "id", "problem", "solution", "tags",
             "user_id" AS "userId", "score",
             "created_at" AS "createdAt"
      FROM "solution"${settingsJoin}
      WHERE ${candidatePredicate}
      ORDER BY
        CASE WHEN ${TEXT_VECTOR} @@ ${strictQuery} THEN 0 ELSE 1 END,
        ts_rank(${TEXT_VECTOR}, ${candidateQuery}) DESC,
        ${similarityOrder} DESC,
        "score" DESC,
        "created_at" DESC
      LIMIT ${input.limit}
    `);
    return rows;
  } catch (error) {
    if (!isMissingPgTrgm(error)) throw error;

    const { rows } = await db.execute<SearchSolution>(sql`
      SELECT "id", "problem", "solution", "tags",
             "user_id" AS "userId", "score",
             "created_at" AS "createdAt"
      FROM "solution"
      WHERE ${TEXT_VECTOR} @@ ${candidateQuery}
      ORDER BY
        CASE WHEN ${TEXT_VECTOR} @@ ${strictQuery} THEN 0 ELSE 1 END,
        ts_rank(${TEXT_VECTOR}, ${candidateQuery}) DESC,
        "score" DESC,
        "created_at" DESC
      LIMIT ${input.limit}
    `);
    return rows;
  }
}
