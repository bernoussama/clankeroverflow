import { randomUUID } from "node:crypto";

import type {
  LogSolutionInput,
  SearchSolutionsInput,
  SolutionBackend,
  SolutionResult,
  VoteSolutionInput,
} from "./backend";
import { openLocalDb, type LocalDb } from "./local-db";
import {
  createLocalEmbedder,
  embeddingFingerprintForConfig,
  ensureLocalSemanticSchema,
  ensureVecTable,
  getLocalSemanticStatus,
  getSolutionsNeedingEmbedding,
  insertEmbedding,
  queryEmbeddingText,
  solutionContentHash,
  solutionEmbeddingText,
  type LocalSemanticConfig,
} from "./local-semantic";

export class LocalSemanticSearchNotConfiguredError extends Error {
  constructor() {
    super(
      "Local semantic search is not configured yet. Use keyword or hybrid mode for local SQLite search.",
    );
  }
}

type SearchRow = SolutionResult & { rank: number };
type Embedder = { embed(text: string): Promise<Buffer> };

function nowIso() {
  return new Date().toISOString();
}

export function localFtsQuery(query: string) {
  const normalized = query
    .replace(/https?:\/\/\S+/gi, (match) => match.replace(/[/:.?=&%#-]+/g, " "))
    .trim();
  const phrases = [...normalized.matchAll(/"([^"]+)"/g)].map((match) => match[1]?.trim() ?? "");
  const withoutPhrases = normalized.replace(/"[^"]+"/g, " ");
  const terms = withoutPhrases.match(/[\p{L}\p{N}_][\p{L}\p{N}_./:-]*/gu) ?? [];
  const phraseClauses = phrases
    .map((phrase) => phrase.replace(/[^\p{L}\p{N}_-]+/gu, " ").trim())
    .filter(Boolean)
    .map((phrase) => `"${phrase.replaceAll('"', '""')}"`);
  const termClauses = terms
    .flatMap((term) =>
      term
        .replace(/[^\p{L}\p{N}_-]+/gu, " ")
        .trim()
        .split(/\s+/),
    )
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`);
  return [...new Set([...phraseClauses, ...termClauses])].join(" ");
}

export function localRelaxedFtsQuery(query: string) {
  const normalized = query
    .replace(/https?:\/\/\S+/gi, (match) => match.replace(/[/:.?=&%#-]+/g, " "))
    .trim();
  const phrases = [...normalized.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1]?.replace(/[^\p{L}\p{N}_-]+/gu, " ").trim() ?? "")
    .filter(Boolean)
    .map((phrase) => `"${phrase.replaceAll('"', '""')}"`);
  const terms = normalized
    .replace(/"[^"]+"/g, " ")
    .match(/[\p{L}\p{N}_][\p{L}\p{N}_./:-]*/gu)
    ?.flatMap((term) =>
      term
        .replace(/[^\p{L}\p{N}_-]+/gu, " ")
        .trim()
        .split(/\s+/),
    )
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"*`);
  return [...new Set([...phrases, ...(terms ?? [])])].join(" OR ");
}

export function reciprocalRankFusion(
  lists: Array<{ weight: number; results: SolutionResult[] }>,
  limit: number,
) {
  const k = 60;
  const scores = new Map<string, { result: SolutionResult; score: number; bestRank: number }>();
  for (const list of lists) {
    list.results.forEach((result, index) => {
      const rank = index + 1;
      const existing = scores.get(result.id);
      const score = list.weight / (k + rank);
      if (existing) {
        existing.score += score;
        existing.bestRank = Math.min(existing.bestRank, rank);
      } else {
        scores.set(result.id, { result, score, bestRank: rank });
      }
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || b.result.score - a.result.score || a.bestRank - b.bestRank)
    .slice(0, limit)
    .map((entry) => entry.result);
}

function searchLocalKeywordExpression(db: LocalDb, query: string, limit: number) {
  if (!query) return [];

  return db
    .prepare(
      `WITH fts_matches AS (
         SELECT rowid, bm25(solution_fts) AS rank
         FROM solution_fts
         WHERE solution_fts MATCH ?
         ORDER BY rank ASC
         LIMIT ?
       )
       SELECT solution.id, solution.problem, solution.solution, solution.tags, solution.score,
              fts_matches.rank AS rank
       FROM fts_matches
       JOIN solution ON solution.rowid = fts_matches.rowid
       ORDER BY rank ASC, solution.score DESC, solution.created_at DESC
       LIMIT ?`,
    )
    .all(query, Math.max(limit, 40), limit) as SearchRow[];
}

export function searchLocalKeywordExact(db: LocalDb, queryText: string, limit: number) {
  return searchLocalKeywordExpression(db, localFtsQuery(queryText.trim()), limit);
}

export function searchLocalKeywordRelaxed(db: LocalDb, queryText: string, limit: number) {
  return searchLocalKeywordExpression(db, localRelaxedFtsQuery(queryText.trim()), limit);
}

export function searchLocalKeyword(db: LocalDb, queryText: string, limit: number) {
  const exact = searchLocalKeywordExact(db, queryText, limit);
  if (exact.length >= limit) return exact;
  const relaxed = searchLocalKeywordRelaxed(db, queryText, Math.max(limit, 40));
  const seen = new Set(exact.map((result) => result.id));
  return [...exact, ...relaxed.filter((result) => !seen.has(result.id))].slice(0, limit);
}

export function searchLocalSemantic(db: LocalDb, embedding: Buffer, limit: number) {
  const rows = db
    .prepare(
      `SELECT solution_id, distance
       FROM solution_vec
       WHERE embedding MATCH ? AND k = ?`,
    )
    .all(embedding, Math.max(limit, 1)) as Array<{ solution_id: string; distance: number }>;
  if (!rows.length) return [];
  const ids = rows.map((row) => row.solution_id);
  const placeholders = ids.map(() => "?").join(",");
  const hydrated = db
    .prepare(
      `SELECT id, problem, solution, tags, score
       FROM solution
       WHERE id IN (${placeholders})`,
    )
    .all(...ids) as SolutionResult[];
  const byId = new Map(hydrated.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is SolutionResult => Boolean(row));
}

export class LocalBackend implements SolutionBackend {
  private db: LocalDb;
  private semantic?: LocalSemanticConfig;
  private embedder?: Embedder;

  constructor(
    dbPath: string,
    options: { semantic?: LocalSemanticConfig; embedder?: Embedder } = {},
  ) {
    this.db = openLocalDb(dbPath);
    this.semantic = options.semantic;
    this.embedder = options.embedder;
    ensureLocalSemanticSchema(this.db);
  }

  async log(input: LogSolutionInput): Promise<{ id: string; warning?: string }> {
    const id = randomUUID();
    const timestamp = nowIso();
    const tags = input.tags ?? null;
    let warning: string | undefined;

    const insert = this.db.transaction(() => {
      const info = this.db
        .prepare(
          `INSERT INTO solution (id, problem, solution, tags, score, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(id, input.problem, input.solution, tags, timestamp, timestamp);

      this.db
        .prepare(
          `INSERT INTO solution_fts (rowid, problem, solution, tags)
           VALUES (?, ?, ?, ?)`,
        )
        .run(info.lastInsertRowid, input.problem, input.solution, tags);
    });

    insert.immediate();
    if (this.semantic?.enabled) {
      try {
        await this.embedSolution(id, input.problem, input.solution, tags);
      } catch (error) {
        warning = `Solution logged, but local semantic indexing failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }
    return { id, warning };
  }

  async search(input: SearchSolutionsInput): Promise<SolutionResult[]> {
    if (input.mode === "semantic" && !this.semantic?.enabled) {
      throw new LocalSemanticSearchNotConfiguredError();
    }

    if (input.mode === "semantic") {
      return this.searchSemantic(input.query, input.limit);
    }
    if (input.mode === "hybrid" && this.semantic?.enabled) {
      const [keywordResults, semanticResults] = await Promise.all([
        searchLocalKeywordRelaxed(this.db, input.query, Math.max(input.limit, 20)),
        this.searchSemantic(input.query, Math.max(input.limit, 20)),
      ]);
      return reciprocalRankFusion(
        [
          { weight: 1.25, results: keywordResults },
          { weight: 1, results: semanticResults },
        ],
        input.limit,
      );
    }
    return input.keywordStrategy === "exact"
      ? searchLocalKeywordExact(this.db, input.query, input.limit)
      : this.searchKeyword(input.query, input.limit);
  }

  searchExactKeyword(input: { query: string; limit: number }) {
    return Promise.resolve(searchLocalKeywordExact(this.db, input.query, input.limit));
  }

  private searchKeyword(queryText: string, limit: number) {
    return searchLocalKeyword(this.db, queryText, limit);
  }

  private async searchSemantic(queryText: string, limit: number) {
    if (!this.semantic?.enabled) throw new LocalSemanticSearchNotConfiguredError();
    await ensureVecTable(this.db, this.semantic.dimensions);
    const embedder = await this.resolveEmbedder();
    const embedding = await embedder.embed(queryEmbeddingText(queryText));
    return searchLocalSemantic(this.db, embedding, limit);
  }

  async embedPending(options: { force?: boolean; limit?: number } = {}) {
    if (!this.semantic?.enabled) throw new LocalSemanticSearchNotConfiguredError();
    await ensureVecTable(this.db, this.semantic.dimensions);
    if (options.force) {
      this.db.prepare("DELETE FROM solution_embedding").run();
      this.db.prepare("DELETE FROM solution_vec").run();
    }
    const fingerprint = embeddingFingerprintForConfig(this.semantic);
    const rows = getSolutionsNeedingEmbedding(this.db, this.semantic, {
      fingerprint,
      limit: options.limit,
    });
    for (const row of rows) {
      await this.embedSolution(row.id, row.problem, row.solution, row.tags, fingerprint);
    }
    return { embedded: rows.length };
  }

  async status() {
    const semantic = this.semantic ?? {
      enabled: false,
      modelId: "disabled",
      modelPath: "",
      dimensions: 384,
    };
    return getLocalSemanticStatus(this.db, semantic);
  }

  private async embedSolution(
    id: string,
    problem: string,
    solution: string,
    tags: string | null,
    fingerprint = this.semantic?.enabled ? embeddingFingerprintForConfig(this.semantic) : "",
  ) {
    if (!this.semantic?.enabled) return;
    await ensureVecTable(this.db, this.semantic.dimensions);
    const embedder = await this.resolveEmbedder();
    const text = solutionEmbeddingText({ problem, solution, tags });
    const embedding = await embedder.embed(text);
    insertEmbedding(this.db, {
      solutionId: id,
      model: this.semantic.modelId,
      fingerprint,
      contentHash: solutionContentHash({ problem, solution, tags }),
      dimensions: this.semantic.dimensions,
      embedding,
      embeddedAt: nowIso(),
    });
  }

  private async resolveEmbedder() {
    if (this.embedder) return this.embedder;
    if (!this.semantic?.enabled) throw new LocalSemanticSearchNotConfiguredError();
    this.embedder = await createLocalEmbedder(this.semantic);
    return this.embedder;
  }

  async vote(input: VoteSolutionInput): Promise<void> {
    const nextVote = input.isUpvote ? "up" : "down";
    const update = this.db.transaction(() => {
      const solution = this.db.prepare("SELECT id FROM solution WHERE id = ?").get(input.id);
      if (!solution) {
        throw new Error(`Local solution not found: ${input.id}`);
      }

      const previous = this.db
        .prepare("SELECT vote FROM solution_vote WHERE solution_id = ?")
        .get(input.id) as { vote: "up" | "down" } | undefined;
      if (previous?.vote === nextVote) {
        return;
      }

      const previousValue = previous?.vote === "up" ? 1 : previous?.vote === "down" ? -1 : 0;
      const nextValue = nextVote === "up" ? 1 : -1;
      const delta = nextValue - previousValue;
      const timestamp = nowIso();

      this.db
        .prepare(
          `INSERT INTO solution_vote (solution_id, vote, created_at)
           VALUES (?, ?, ?)
           ON CONFLICT(solution_id) DO UPDATE SET vote = excluded.vote, created_at = excluded.created_at`,
        )
        .run(input.id, nextVote, timestamp);
      this.db
        .prepare("UPDATE solution SET score = score + ?, updated_at = ? WHERE id = ?")
        .run(delta, timestamp, input.id);
    });

    update.immediate();
  }
}
