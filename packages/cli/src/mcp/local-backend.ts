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

export class FtsQuerySyntaxError extends Error {}

/** FTS5 column names backed by the solution_fts(problem, solution, tags) table. */
const FTS_COLUMNS = new Set(["problem", "solution", "tags"]);
/** Bare uppercase FTS5 boolean operators. */
const FTS_BOOLEAN_OPERATORS = new Set(["AND", "OR", "NOT"]);

function ftsSyntaxError(message: string): never {
  throw new FtsQuerySyntaxError(
    `${message} Valid FTS5 syntax: quoted "phrases", prefix term*, ` +
      `column:term, term AND/OR/NOT term, (group), NEAR(term, term, N). ` +
      `To search for these words literally, wrap the whole query in double quotes.`,
  );
}

/**
 * Quote a bare term/phrase for FTS5 as a string literal, escaping embedded
 * double quotes by doubling them.
 */
function quoteFtsTerm(term: string) {
  return `"${term.replaceAll('"', '""')}"`;
}

type FtsToken =
  | { type: "phrase"; value: string }
  | { type: "word"; value: string }
  | { type: "operator"; value: "AND" | "OR" | "NOT" }
  | { type: "lparen" }
  | { type: "rparen" };

/**
 * Tokenize a query into FTS5-aware tokens, respecting double-quoted phrases and
 * parentheses. Throws on unterminated quotes or unbalanced parentheses; the
 * caller validates the resulting token stream against FTS5 grammar.
 */
function tokenizeFtsQuery(query: string): FtsToken[] {
  const tokens: FtsToken[] = [];
  let current = "";
  let inQuotes = false;

  const flushWord = () => {
    const word = current.trim();
    current = "";
    if (!word) return;
    if (FTS_BOOLEAN_OPERATORS.has(word)) {
      tokens.push({ type: "operator", value: word as "AND" | "OR" | "NOT" });
    } else {
      tokens.push({ type: "word", value: word });
    }
  };

  for (const char of query) {
    if (inQuotes) {
      current += char;
      if (char === '"') inQuotes = false;
      continue;
    }
    if (char === '"') {
      current += char;
      inQuotes = true;
      continue;
    }
    if (char === "(" || char === ")") {
      flushWord();
      tokens.push(char === "(" ? { type: "lparen" } : { type: "rparen" });
      continue;
    }
    if (/\s/.test(char)) {
      flushWord();
      continue;
    }
    current += char;
  }
  if (inQuotes) ftsSyntaxError("unterminated double-quoted phrase.");
  flushWord();
  return tokens;
}

/** Convert a quoted `"..."` token (with surrounding quotes) into a phrase token. */
function phraseToken(raw: string): FtsToken {
  // Strip the outer quotes; inner content is the literal phrase.
  const value = raw.slice(1, -1).trim();
  return { type: "phrase", value };
}

/** Re-tokenize so quoted phrases are recognized as phrase tokens. */
function withPhrases(tokens: FtsToken[]): FtsToken[] {
  return tokens.map((token) =>
    token.type === "word" && token.value.startsWith('"') && token.value.endsWith('"')
      ? phraseToken(token.value)
      : token,
  );
}

/** A query is "advanced" if it uses any operator, parenthesis, or column filter. */
function isAdvancedQuery(tokens: FtsToken[]) {
  return tokens.some((token) => {
    if (token.type === "operator" || token.type === "lparen" || token.type === "rparen")
      return true;
    if (token.type === "word") {
      // Column filter (col:term) or prefix term (term*) or NEAR(.
      if (/^[a-z]+:/i.test(token.value)) return true;
      if (/^NEAR\s*\(/i.test(token.value)) return true;
    }
    return false;
  });
}

/**
 * Render a single word/phrase token as an FTS5 term, handling column filters
 * (`col:term`), prefix terms (`term*`), and rejecting stray operators/special
 * chars. Bare negation (`-term`) is rejected because FTS5 requires a positive
 * term first.
 */
function renderAdvancedTerm(token: Extract<FtsToken, { value: string }>): string {
  if (token.type === "phrase") return quoteFtsTerm(token.value);

  let value = token.value;
  let column: string | undefined;

  const columnMatch = value.match(/^([a-z]+):(.*)$/i);
  if (columnMatch) {
    column = columnMatch[1]!.toLowerCase();
    if (!FTS_COLUMNS.has(column)) {
      ftsSyntaxError(`unknown FTS5 column "${column}". Valid columns: problem, solution, tags.`);
    }
    value = columnMatch[2] ?? "";
    if (!value) ftsSyntaxError("FTS5 column filter is missing a term.");
  }

  if (value.startsWith("-")) {
    ftsSyntaxError('bare "-term" negation needs a positive term first; use FTS5 NOT instead.');
  }
  // Reject chars that aren't valid FTS5 term syntax at this position.
  if (/[~'=]/.test(value)) ftsSyntaxError(`invalid character in term "${token.value}".`);

  const isPrefix = value.endsWith("*");
  const clean = (isPrefix ? value.slice(0, -1) : value).replace(/[^\p{L}\p{N}_-]+/gu, " ").trim();
  if (!clean) ftsSyntaxError(`empty term in "${token.value}".`);

  const quoted = quoteFtsTerm(clean);
  const body = column ? `${column} : ${quoted}` : quoted;
  return isPrefix ? `${body}*` : body;
}

/**
 * Build an FTS5 MATCH expression from an "advanced" token stream. Adjacent terms
 * are allowed (FTS5 treats them as implicit AND). Explicit operators must sit
 * between terms; a leading operator, a doubled operator, or a dangling operator
 * at the end are rejected.
 */
function buildAdvancedQuery(tokens: FtsToken[]) {
  const parts: string[] = [];
  let openParens = 0;
  // expectTerm === true means the next token must be a term/group; false means
  // it must be a term (implicit AND) or an explicit operator.
  let expectTerm = true;

  for (const token of tokens) {
    switch (token.type) {
      case "lparen": {
        if (!expectTerm) parts.push("AND"); // implicit AND before a group
        parts.push("(");
        openParens += 1;
        expectTerm = true;
        break;
      }
      case "rparen": {
        if (expectTerm) ftsSyntaxError('")" appears where a term is expected.');
        if (openParens === 0) ftsSyntaxError('unmatched ")" in query.');
        parts.push(")");
        openParens -= 1;
        break;
      }
      case "operator": {
        if (expectTerm) {
          if (token.value === "NOT") {
            ftsSyntaxError('"NOT" needs a term before it; leading negation is invalid.');
          }
          ftsSyntaxError(`operator "${token.value}" appears at the start of the query.`);
        }
        parts.push(token.value);
        expectTerm = true;
        break;
      }
      default: {
        // word or phrase term (incl. column filters / NEAR).
        if (!expectTerm) parts.push("AND"); // implicit AND between adjacent terms
        parts.push(
          token.type === "word" && /^NEAR\s*\(/i.test(token.value)
            ? token.value
            : renderAdvancedTerm(token),
        );
        expectTerm = false;
        break;
      }
    }
  }

  if (openParens !== 0) ftsSyntaxError('unmatched "(" in query.');
  if (expectTerm) ftsSyntaxError("query ends with an operator but no term.");

  return parts.join(" ");
}

/**
 * Simple-mode query: every term/phrase becomes a quoted FTS5 string literal
 * joined with implicit AND. URLs are already broken into fragments by the
 * caller. Leading `-` on a term is rejected (FTS5 doesn't support bare negation
 * without a positive term).
 */
function buildSimpleQuery(query: string) {
  const phrases = [...query.matchAll(/"([^"]+)"/g)].map((match) => match[1]?.trim() ?? "");
  const withoutPhrases = query.replace(/"[^"]+"/g, " ");
  // Bare FTS5 metacharacters that don't form part of a normal term indicate the
  // user meant advanced syntax; reject them rather than silently dropping.
  if (/[~=]/.test(withoutPhrases)) {
    ftsSyntaxError(
      `the query contains FTS5 operators (~ or =) that need advanced syntax. ` +
        `Drop them or use explicit AND/OR/NOT operators.`,
    );
  }
  const terms = withoutPhrases.match(/-?[\p{L}\p{N}_][\p{L}\p{N}_./:-]*/gu) ?? [];
  const rendered = [...phrases, ...terms]
    .map((term) => {
      if (term.startsWith("-")) {
        ftsSyntaxError(
          `bare negation "-${term.slice(1)}" needs a positive term first; use FTS5 NOT instead.`,
        );
      }
      const clean = term.replace(/[^\p{L}\p{N}_-]+/gu, " ").trim();
      return clean ? quoteFtsTerm(clean) : "";
    })
    .filter(Boolean);
  return rendered.join(" ");
}

/** Break URLs into space-separated word fragments before further parsing. */
function normalizeUrls(query: string) {
  return query.replace(/https?:\/\/\S+/gi, (match) => match.replace(/[/:.?=&%#-]+/g, " "));
}

/**
 * Translate a user search query into an FTS5 MATCH expression. When the query
 * uses FTS5 operators (AND/OR/NOT, NEAR, column filters, prefix terms), they're
 * honored; otherwise it's treated as a simple all-terms-AND search. Malformed
 * FTS5 syntax throws {@link FtsQuerySyntaxError} with an actionable message.
 * The result is always bound as a MATCH parameter, so this never touches SQL.
 */
export function ftsQuery(query: string) {
  const trimmed = normalizeUrls(query).trim();
  if (!trimmed) return "";
  const tokens = withPhrases(tokenizeFtsQuery(trimmed));
  if (tokens.length === 0) return "";
  return isAdvancedQuery(tokens) ? buildAdvancedQuery(tokens) : buildSimpleQuery(trimmed);
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
    if (!input.query.trim()) {
      throw new Error("search query must not be empty");
    }
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
