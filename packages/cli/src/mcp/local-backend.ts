import { randomUUID } from "node:crypto";

import type {
  LogSolutionInput,
  SearchSolutionsInput,
  SolutionBackend,
  SolutionResult,
  VoteSolutionInput,
} from "./backend";
import { openLocalDb, type LocalDb } from "./local-db";

export class LocalSemanticSearchNotConfiguredError extends Error {
  constructor() {
    super(
      "Local semantic search is not configured yet. Use keyword or hybrid mode for local SQLite search.",
    );
  }
}

type SearchRow = SolutionResult & { rank: number };

function nowIso() {
  return new Date().toISOString();
}

function ftsQuery(query: string) {
  const terms = query.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" ");
}

export class LocalBackend implements SolutionBackend {
  private db: LocalDb;

  constructor(dbPath: string) {
    this.db = openLocalDb(dbPath);
  }

  async log(input: LogSolutionInput): Promise<{ id: string }> {
    const id = randomUUID();
    const timestamp = nowIso();
    const tags = input.tags ?? null;

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
    return { id };
  }

  async search(input: SearchSolutionsInput): Promise<SolutionResult[]> {
    if (input.mode === "semantic") {
      throw new LocalSemanticSearchNotConfiguredError();
    }

    const query = ftsQuery(input.query.trim());
    if (!query) {
      return [];
    }

    return this.db
      .prepare(
        `SELECT solution.id, solution.problem, solution.solution, solution.tags, solution.score,
                bm25(solution_fts) AS rank
         FROM solution_fts
         JOIN solution ON solution.rowid = solution_fts.rowid
         WHERE solution_fts MATCH ?
         ORDER BY rank ASC, solution.score DESC, solution.created_at DESC
         LIMIT ?`,
      )
      .all(query, input.limit) as SearchRow[];
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
