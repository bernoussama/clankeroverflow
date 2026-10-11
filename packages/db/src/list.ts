import { and, desc, eq } from "drizzle-orm";

import type { getDb } from "./index";
import { kbDocument } from "./schema/knowledge";

type Database = ReturnType<typeof getDb>;

const kbListColumns = {
  docId: kbDocument.docId,
  path: kbDocument.path,
  rev: kbDocument.rev,
  updatedAt: kbDocument.updatedAt,
};

export async function listKbDocuments(db: Database, input: { teamId: string; limit: number }) {
  const items = await db
    .select(kbListColumns)
    .from(kbDocument)
    .where(and(eq(kbDocument.teamId, input.teamId), eq(kbDocument.deleted, false)))
    .orderBy(desc(kbDocument.updatedAt), desc(kbDocument.docId))
    .limit(input.limit);
  return { items };
}
