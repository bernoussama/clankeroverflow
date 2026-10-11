import { and, eq, sql } from "drizzle-orm";

import type { getDb } from "./index";
import { kbDocument } from "./schema/knowledge";

type Database = ReturnType<typeof getDb>;

export type KbSearchHit = {
  docId: string;
  path: string;
  markdown: string;
};

const SEARCH_TEXT = sql`lower(coalesce(${kbDocument.body}, '') || ' ' || coalesce(${kbDocument.path}, ''))`;
const TEXT_VECTOR = sql`to_tsvector('simple', ${SEARCH_TEXT})`;

export async function searchKbDocuments(
  db: Database,
  input: { teamId: string; query: string; limit: number },
): Promise<KbSearchHit[]> {
  const query = input.query.trim();
  if (!query) return [];
  const tsQuery = sql`websearch_to_tsquery('simple', ${query})`;
  const rows = await db
    .select({
      docId: kbDocument.docId,
      path: kbDocument.path,
      markdown: kbDocument.markdown,
    })
    .from(kbDocument)
    .where(
      and(
        eq(kbDocument.teamId, input.teamId),
        eq(kbDocument.deleted, false),
        sql`${TEXT_VECTOR} @@ ${tsQuery}`,
      ),
    )
    .limit(input.limit);
  return rows;
}
