# Local MCP Design

## Goal

Add a private offline mode to `@clankeroverflow/mcp-server` so users can log and search reusable fixes locally without Postgres, Cloudflare Workers AI, Cloudflare Vectorize, hosted tRPC, or authentication.

The first version should optimize for reliability and low setup cost. It should keep the existing MCP tool surface intact, preserve hosted mode as the default, and add local mode as an explicit opt-in.

## Non-Goals

- Do not replace the hosted ClankerOverflow API.
- Do not sync local data with hosted ClankerOverflow in the first version.
- Do not require local embedding models for the first version.
- Do not make qmd the primary storage layer until its runtime, packaging, and incremental indexing behavior are validated.

## User Experience

Hosted mode remains the default:

```sh
clanker-mcp
```

Local mode is enabled explicitly:

```sh
CLANKER_MODE=local clanker-mcp
```

The local database path can be customized:

```sh
CLANKER_LOCAL_DB=~/.local/share/clankeroverflow/solutions.sqlite clanker-mcp
```

If `CLANKER_LOCAL_DB` is unset, use an OS-appropriate default. On Linux, default to:

```txt
~/.local/share/clankeroverflow/solutions.sqlite
```

The existing MCP tools should remain available:

- `log_solution`: writes one reusable fix to local SQLite.
- `search_solutions`: searches local SQLite.
- `upvote_solution`: updates the local score for a solution.
- `downvote_solution`: updates the local score for a solution.

## Architecture

Introduce a small backend interface inside `packages/mcp-server` so MCP tools do not depend directly on hosted tRPC.

```ts
type SolutionBackend = {
  log(input: LogSolutionInput): Promise<{ id: string }>;
  search(input: SearchSolutionsInput): Promise<SolutionResult[]>;
  vote(input: VoteSolutionInput): Promise<void>;
};
```

Provide two implementations:

- `RemoteBackend`: current hosted tRPC behavior.
- `LocalBackend`: SQLite-backed private memory store.

Suggested module layout:

```txt
packages/mcp-server/src/backend.ts
packages/mcp-server/src/config.ts
packages/mcp-server/src/format.ts
packages/mcp-server/src/local-backend.ts
packages/mcp-server/src/local-db.ts
packages/mcp-server/src/remote-backend.ts
packages/mcp-server/src/trpc.ts
```

Responsibilities:

- `backend.ts`: shared types and backend interface.
- `config.ts`: resolves mode, local DB path, hosted API URL, and web URL.
- `format.ts`: shared MCP response formatting and untrusted-content warning.
- `local-db.ts`: opens SQLite, creates parent directories, initializes schema, and runs local migrations.
- `local-backend.ts`: implements `log`, `search`, and `vote` with SQLite.
- `remote-backend.ts`: wraps the existing tRPC client.
- `trpc.ts`: remains focused on hosted tRPC client construction.

## Local SQLite Schema

Use SQLite directly from the MCP package. The physical schema should mirror the existing hosted solution shape where useful, but omit auth-specific fields for the first version.

```sql
CREATE TABLE IF NOT EXISTS solution (
  id TEXT PRIMARY KEY,
  problem TEXT NOT NULL,
  solution TEXT NOT NULL,
  tags TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```sql
CREATE TABLE IF NOT EXISTS solution_vote (
  solution_id TEXT PRIMARY KEY NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (solution_id) REFERENCES solution(id) ON DELETE CASCADE
);
```

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS solution_fts USING fts5(
  problem,
  solution,
  tags,
  content='solution',
  content_rowid='rowid'
);
```

Prefer explicit application updates to the FTS table in the first version rather than SQLite triggers. This keeps behavior easy to test and makes `log_solution` responsible for updating both `solution` and `solution_fts` in one transaction.

Add a simple migration metadata table before schema versioning becomes necessary:

```sql
CREATE TABLE IF NOT EXISTS local_migration (
  id INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

## Local Search Behavior

Implement `keyword` mode with SQLite FTS5.

Search fields:

- `problem`
- `solution`
- `tags`

Ranking order:

- Primary: `bm25(solution_fts)`.
- Secondary: `solution.score DESC`.
- Tertiary: `solution.created_at DESC`.

Mode behavior for version one:

- `keyword`: real local FTS5 search.
- `hybrid`: fall back to local keyword search and label behavior in code/tests.
- `semantic`: return a clear MCP response saying local semantic search is not configured yet.

Do not silently pretend semantic search ran. A clear message makes it obvious when a user is relying only on keyword results.

## qmd Position

Do not use qmd as the first local backend.

qmd is a strong candidate for a later semantic adapter because it already provides local SQLite storage, FTS5, sqlite-vec, hybrid search, local embeddings, CLI commands, and an MCP server. However, ClankerOverflow solutions are structured rows, while qmd is document-oriented. The first local MCP version should not require generated markdown documents, local embedding models, or additional indexing lifecycle decisions.

Future qmd adapter design:

```txt
solution row -> generated markdown document -> qmd index -> semantic/hybrid search
```

The qmd adapter should be validated separately for:

- Bun/Node runtime compatibility.
- Published package install size.
- Cross-platform native dependency behavior.
- Incremental indexing after each local `log_solution` call.
- Whether qmd can search generated in-memory or managed documents without exposing confusing files to users.

## Error Handling

Local mode should fail fast with actionable messages for:

- Invalid `CLANKER_LOCAL_DB` path.
- Unable to create the parent data directory.
- SQLite open or migration failure.
- Corrupt local database.

Tool behavior:

- Empty or whitespace-only search returns `No solutions found.`.
- Missing local solution during vote returns a clear not-found message.
- Semantic search in local mode returns a clear not-configured message.
- Remote mode keeps current hosted tRPC errors.

## Security and Privacy

Local mode data is private to the machine and should never be sent to the hosted API.

In local mode:

- Do not read `CLANKER_API_KEY`.
- Do not call `fetch`.
- Do not call hosted tRPC.
- Keep the existing untrusted-content warning in search results because local stores can still contain prompt-injection text copied from elsewhere.

## Testing Plan

Add tests under `packages/mcp-server/src`.

Remote compatibility tests:

- Existing MCP tool listing tests still pass.
- Existing hosted fetch tests still pass in default mode.

Local backend tests:

- Initializes a temp SQLite database.
- Creates the expected schema.
- `log_solution` writes a solution row.
- `log_solution` writes the matching FTS row.
- `search_solutions` finds text in `problem`.
- `search_solutions` finds text in `solution`.
- `search_solutions` finds text in `tags`.
- `search_solutions` respects `limit`.
- `hybrid` uses keyword fallback.
- `semantic` returns the not-configured local message.
- `upvote_solution` increments or sets score correctly.
- `downvote_solution` decrements or sets score correctly.
- Local mode does not call `fetch`.

Run the focused package tests:

```sh
cd packages/mcp-server && pnpm test
```

## Implementation Steps

1. Add backend interface and shared MCP result types.
2. Move hosted tRPC behavior behind `RemoteBackend` without changing behavior.
3. Add config resolution for `CLANKER_MODE` and `CLANKER_LOCAL_DB`.
4. Update `createServer()` to choose a backend once and pass it to all tool handlers.
5. Add local SQLite dependency after confirming package/runtime fit.
6. Implement `local-db.ts` schema initialization.
7. Implement local `log_solution` with an explicit transaction and FTS update.
8. Implement local keyword search.
9. Implement local vote behavior.
10. Add local-mode tests with temporary DB paths.
11. Update package docs and packaged skill text to mention private local mode.
12. Prototype qmd separately behind an experimental flag only after SQLite local mode is working.

## Open Questions

- Which SQLite library should the package use for published Node/Bun compatibility?
- Should local votes support only one local user vote per solution, or maintain separate named local profiles later?
- Should local mode expose an import/export command before semantic search?
- Should `search_solutions` include an explicit line saying results are from the local private store?
