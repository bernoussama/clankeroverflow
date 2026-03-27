import { schema } from "@clankeroverflow/db";
import type { SolutionListCursor, SolutionListSort } from "@clankeroverflow/db/list";

export type CachedSolutionRow = Omit<
  typeof schema.solution.$inferSelect,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

/** Safety TTL so orphaned keys expire if version bumps are missed. */
export const SOLUTION_KV_TTL_SEC = 120;

const LIST_VERSION_KEY = "sol:lv";

export type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

function normalizeSearchQueryKey(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function getSolutionListCacheVersion(kv: KvLike): Promise<number> {
  const v = await kv.get(LIST_VERSION_KEY);
  if (!v) return 0;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Bump when list/search ordering or membership can change (new solution, vote). */
export async function bumpSolutionListCacheVersion(kv: KvLike): Promise<void> {
  const next = String((await getSolutionListCacheVersion(kv)) + 1);
  await kv.put(LIST_VERSION_KEY, next);
}

export function solutionListCacheKey(
  listVersion: number,
  sort: SolutionListSort,
  cursor: SolutionListCursor | null,
  limit: number,
): string {
  const cursorPart = cursor
    ? `${cursor.id}:${cursor.createdAt}:${cursor.score}`
    : "root";
  return `sol:list:${listVersion}:${sort}:${cursorPart}:${limit}`;
}

export function solutionSearchCacheKey(
  listVersion: number,
  query: string,
  limit: number,
): string {
  const q = normalizeSearchQueryKey(query);
  return `sol:search:${listVersion}:${q}:${limit}`;
}

export function solutionDetailCacheKey(solutionId: string): string {
  return `sol:detail:${solutionId}`;
}

export async function kvGetJson<T>(kv: KvLike, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvPutJson(kv: KvLike, key: string, value: unknown): Promise<void> {
  await kv.put(key, JSON.stringify(value), { expirationTtl: SOLUTION_KV_TTL_SEC });
}

export function serializeSolutionRow(row: typeof schema.solution.$inferSelect): CachedSolutionRow {
  const createdAt =
    row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as string | number | Date);
  const updatedAt =
    row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt as string | number | Date);
  return {
    ...row,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export function reviveSolutionRow(row: CachedSolutionRow): typeof schema.solution.$inferSelect {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export async function invalidateSolutionDetailCache(kv: KvLike, solutionId: string): Promise<void> {
  await kv.delete(solutionDetailCacheKey(solutionId));
}
