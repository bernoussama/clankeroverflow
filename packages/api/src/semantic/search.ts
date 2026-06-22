import { inArray } from "drizzle-orm";

import type { Database } from "@clankeroverflow/db";
import { schema } from "@clankeroverflow/db";
import { searchSolutions } from "@clankeroverflow/db/search";

import { SOLUTION_VECTOR_DIMENSIONS } from "./constants";
import type { WorkersAiBinding } from "./embeddings";
import { embedTexts } from "./embeddings";
import { solutionEmbeddingText } from "./solution-text";

export type HostedHybridFusion = "semantic-first" | "rrf";
export const HOSTED_HYBRID_FUSION: HostedHybridFusion = "semantic-first";

/** Subset of Vectorize binding used for solution search. */
export type SolutionVectorizeBinding = {
  query(
    vector: number[],
    options: { topK: number; returnMetadata?: "none" | "indexed" | "all" },
  ): Promise<{ matches?: Array<{ id: string; score?: number }> }>;
  upsert(vectors: Array<{ id: string; values: number[] }>): Promise<unknown>;
};

export type SolutionRow = Omit<typeof schema.solution.$inferSelect, "updatedAt">;

const solutionSearchColumns = {
  id: schema.solution.id,
  problem: schema.solution.problem,
  solution: schema.solution.solution,
  tags: schema.solution.tags,
  userId: schema.solution.userId,
  score: schema.solution.score,
  createdAt: schema.solution.createdAt,
};

async function fetchSolutionsByIdsOrdered(db: Database, ids: string[]): Promise<SolutionRow[]> {
  if (ids.length === 0) return [];

  const rows = await db
    .select(solutionSearchColumns)
    .from(schema.solution)
    .where(inArray(schema.solution.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is SolutionRow => r !== undefined);
}

export async function searchSolutionsSemantic(params: {
  db: Database;
  ai: WorkersAiBinding;
  vectorize: SolutionVectorizeBinding;
  query: string;
  limit: number;
}): Promise<SolutionRow[]> {
  const q = params.query.trim();
  if (!q) return [];

  const [queryVec] = await embedTexts(params.ai, [q]);
  if (!queryVec) return [];

  const matches = await params.vectorize.query(queryVec, {
    topK: Math.min(50, Math.max(params.limit, params.limit * 3)),
    returnMetadata: "none",
  });

  const matchList = matches.matches ?? [];
  const ids = matchList.map((m) => m.id).filter(Boolean);
  if (ids.length === 0) return [];

  const ordered = await fetchSolutionsByIdsOrdered(params.db, ids);
  return ordered.slice(0, params.limit);
}

export async function searchSolutionsHybrid(params: {
  db: Database;
  ai: WorkersAiBinding;
  vectorize: SolutionVectorizeBinding;
  query: string;
  limit: number;
  fusion?: HostedHybridFusion;
}): Promise<SolutionRow[]> {
  const q = params.query.trim();
  if (!q) return [];

  const [semanticOrdered, keywordRows] = await Promise.all([
    searchSolutionsSemantic({
      db: params.db,
      ai: params.ai,
      vectorize: params.vectorize,
      query: q,
      limit: Math.max(params.limit, 20),
    }),
    searchSolutions(params.db, {
      query: q,
      limit: Math.max(params.limit, 20),
      strategy: "tiered",
    }),
  ]);

  if ((params.fusion ?? HOSTED_HYBRID_FUSION) === "rrf") {
    const k = 60;
    const scores = new Map<string, { row: SolutionRow; score: number; bestRank: number }>();
    for (const [rows, weight] of [
      [keywordRows, 1.25],
      [semanticOrdered, 1],
    ] as const) {
      rows.forEach((row, index) => {
        const rank = index + 1;
        const existing = scores.get(row.id);
        if (existing) {
          existing.score += weight / (k + rank);
          existing.bestRank = Math.min(existing.bestRank, rank);
        } else {
          scores.set(row.id, { row, score: weight / (k + rank), bestRank: rank });
        }
      });
    }
    return [...scores.values()]
      .sort((a, b) => b.score - a.score || b.row.score - a.row.score || a.bestRank - b.bestRank)
      .slice(0, params.limit)
      .map((entry) => entry.row);
  }

  const byId = new Map<string, SolutionRow>();
  for (const r of keywordRows) byId.set(r.id, r);
  for (const r of semanticOrdered) byId.set(r.id, r);

  const out: SolutionRow[] = [];
  const seen = new Set<string>();

  for (const r of semanticOrdered) {
    const row = byId.get(r.id);
    if (row && !seen.has(row.id)) {
      out.push(row);
      seen.add(row.id);
    }
  }

  for (const r of keywordRows) {
    if (!seen.has(r.id)) {
      const row = byId.get(r.id);
      if (row) {
        out.push(row);
        seen.add(r.id);
      }
    }
    if (out.length >= params.limit) break;
  }

  return out.slice(0, params.limit);
}

export async function upsertSolutionVector(params: {
  ai: WorkersAiBinding;
  vectorize: SolutionVectorizeBinding;
  row: Pick<SolutionRow, "id" | "problem" | "solution" | "tags">;
}): Promise<void> {
  const text = solutionEmbeddingText(params.row);
  const [values] = await embedTexts(params.ai, [text]);
  if (!values || values.length !== SOLUTION_VECTOR_DIMENSIONS) {
    throw new Error(`Unexpected embedding length: ${values?.length ?? 0}`);
  }

  await params.vectorize.upsert([{ id: params.row.id, values }]);
}
