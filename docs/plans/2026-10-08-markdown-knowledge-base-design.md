# Markdown Knowledge Base Design

Status: draft for discussion. Open questions are collected at the end.

## Goal

Turn ClankerOverflow from a global solutions database with vector search into **shared context for teams**: each team gets its own knowledge base of markdown files, organized by area (backend, infra, finance, ...), that their agents search before re-solving a problem and update after solving a new one.

The pitch stays the same, "stop re-solving solved problems", but the unit of value changes from "a public Q&A row" to "a team's compiled, living wiki".

## Why change

- The current stack carries a lot of machinery for a small corpus: Postgres FTS with trigram tiers, Workers AI embeddings, Vectorize, hybrid fusion, local GGUF embeddings via `node-llama-cpp`, and `sqlite-vec`. Each piece needs its own benchmark, fallback path, and setup step.
- At team scale (tens to low thousands of documents) the evidence favors simpler retrieval driven by the agent:
  - Claude Code dropped its embedding index because "agentic search" (glob and grep in a loop) "outperformed everything else by a lot", and it avoided stale indexes and permission problems. ([Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny))
  - Letta's agent using only file tools scored 74.0% on LoCoMo, ahead of Mem0's best reported 68.5%. Letta's conclusion was that memory is "more about how agents manage context than the exact retrieval mechanism." ([Letta](https://www.letta.com/blog/benchmarking-ai-agent-memory/))
  - Anthropic's memory tool is plain file CRUD under `/memories`. ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool))
- Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) describes this exact shape. Knowledge is "compiled once and then kept current" in interlinked markdown, an `index.md` catalog replaces embeddings at moderate scale ("~100 sources, ~hundreds of pages"), and a real search engine (BM25) is added only when the wiki outgrows the index.
- Markdown is portable, diffable, reviewable in PRs, readable by humans and agents alike, and has no lock-in. That makes it an easy sell to teams.

## Non-goals (v1)

- No embeddings or vector store. Re-add as an optional reranker only if evals show a gap.
- No knowledge graph and no automatic entity extraction.
- No ingestion of external raw sources (Slack, Notion, docs). V1 covers knowledge that agents and humans write directly.

## Core idea: folders for ownership, frontmatter for meaning

The proposed "folders by department or topic" works well for **ownership and browsing** but poorly as the **only retrieval key**. A Stripe webhook timeout is finance, backend, and infra all at once, and a strict hierarchy forces one arbitrary home and hides the document from the others.

Proposal:

- **Folders (areas)** are shallow (at most 2 levels) and answer "who owns this, and who can see it". They map to departments or teams within a company and later to permissions.
- **Frontmatter** answers "what is this about". Fields like `tags`, `type`, `stack`, and `error_signatures` can hold several values and drive filtering and ranking.
- **Links** (`[[other-doc]]` or relative links) express relationships, as in Karpathy's wiki and Obsidian.

### Layout

```txt
<kb-root>/
  AGENTS.md            # schema and conventions agents must follow when writing (Karpathy's "schema" layer)
  index.md             # generated catalog: one line per doc, grouped by area
  log.md               # append-only: "## [2026-10-08] update | backend/pnpm-ts2307 | by codex"
  backend/
    index.md           # generated per-area catalog
    pnpm-workspace-ts2307.md
    nextjs-cache-tags-stale.md
  infra/
    cloudflare-hyperdrive-pool-exhaustion.md
  finance/
    stripe-webhook-retry-idempotency.md
```

`index.md` files are generated, never hand-edited, so they can't drift.

### Document format

This extends the format `formatLearnMarkdown` / `parseLearnMarkdown` in `packages/cli/src/learn.ts` already produce, so existing exports migrate without loss.

```md
---
id: 01JABC...                 # stable; survives renames and moves
title: pnpm workspace package fails with TS2307
type: fix                     # fix | howto | decision | gotcha | reference
area: backend
tags: [pnpm, typescript, monorepo]
aliases: ["Cannot find module '@acme/ui'"]
error_signatures: ["TS2307: Cannot find module"]
stack: { runtime: node22, framework: nextjs, package_manager: pnpm }
status: verified              # draft | verified | stale | superseded
superseded_by: null
confirmations: 3              # replaces up/down votes
last_verified: 2026-10-01
created: 2026-09-12
updated: 2026-10-01
authors: [codex, sara]
related: [backend/tsconfig-paths-vs-exports]
---

## Problem
## Root Cause
## Fix
## Verification
## Notes
```

## Search: BM25 plus metadata, fuzzy only on short fields

Fuzzy search on titles and then on bodies is a reasonable instinct, but fuzzy matchers rank long text poorly. Fuse.js caps patterns at 32 characters, by default only looks at roughly the first 60 characters of a field, and scans every document. Fuzzy matching is for typos in short strings. Ranking documents needs BM25.

Pipeline for `kb_search(query, filters)`:

1. **Filter** on frontmatter: `area`, `tags`, `type`, `status` (default excludes `superseded`).
2. **Exact signature match.** If the query contains a string from `error_signatures` or `aliases` (case-insensitive substring), those docs go first. For debugging, pasting the exact error is the strongest signal.
3. **BM25** over fields with boosts: `title` 4, `aliases` 3, `error_signatures` 3, `tags` 3, headings 2, body 1. Prefix matching is on for all fields. Fuzzy matching (edit distance about 0.2) is on only for `title`, `tags`, and `aliases`.
4. **Tiebreak** by `status` (verified first), then `confirmations`, then `last_verified` recency.
5. **Return** path, title, frontmatter, and a short snippet. The agent then calls `kb_read` for full documents. This follows the Agent Skills pattern: metadata first, body on demand.

Agents can also browse instead of search: `kb_browse(area)` returns the generated `index.md`. With a few hundred docs, an agent reading the index and choosing is often as good as search (Karpathy).

Engine choice:

| Where | Engine | Why |
|---|---|---|
| Local MCP (Node) | [MiniSearch](https://lucaong.github.io/minisearch/) in memory, rebuilt on file change (mtime or content hash), cached as JSON | BM25+, field boosts, per-field fuzzy and prefix, zero dependencies; thousands of docs index in milliseconds |
| Hosted (Workers) | SQLite FTS5 (D1, one database or table per team) as a **derived** index | `bm25()` with column weights, rebuildable from the markdown at any time |

Either way the markdown files are the source of truth, and the index is a disposable cache.

## Storage

The real decision. Workers have no filesystem, so "just markdown files" needs a concrete home in hosted mode.

- **Local mode:** a directory. The default is `<repo>/.clankeroverflow/kb/` (committed, shared via the repo), with the option `~/.local/share/clankeroverflow/kb/` (personal). This replaces `solutions.sqlite`.
- **Hosted mode, option A: the team's own git repo (recommended starting point).** A team connects a GitHub repo, e.g. `acme/agent-kb`. The local MCP keeps a clone, pulls on start or every N minutes, searches locally, and writes by committing (direct push or a PR, per team setting). The hosted service handles team auth, the web viewer, lint jobs, and webhooks. Benefits: zero lock-in, review through PRs, history for free, and no storage cost. Cost: GitHub auth and merge conflicts (rare, since there's one file per doc).
- **Hosted mode, option B: managed git on [Cloudflare Artifacts](https://developers.cloudflare.com/artifacts/).** One Artifacts repo per team. This replaces the earlier R2 idea, because R2 would force us to rebuild versioning and history ourselves. See the Artifacts section below.

Recommendation: build the backend interface so all three fit. Ship local mode first, then Artifacts as the managed default, with GitHub as an import or mirror for teams that want their own repo.

### Cloudflare Artifacts for managed storage

Artifacts is a versioned file system that speaks git. It entered open beta on 2026-10-01, is available on Workers Paid only, and billing starts 2026-10-14. What it provides that we need:

- **Standard git remotes.** Anyone with a token can `git clone`, edit in an editor or Obsidian, and push. Export is just `git clone`.
- **A Workers binding** for `create`, `get`, `import` (from GitHub), `fork`, `log`, `readTree`, `readFile`, and repo-scoped `read` or `write` tokens with a TTL.
- **Push events** delivered to a Queue (`cf.artifacts.repo.pushed`, with the before and after SHAs and the commit list), which drive reindexing.
- **Forking a baseline repo**, which gives new teams a starter `AGENTS.md`, area folders, and an index.
- **Git notes**, which can record agent provenance (agent, session, model) without touching the docs.
- **US or EU data localization**.

What it does not provide:

- **Search.** We still need a derived full-text index.
- **A write-file method.** Writes from a Worker go through `isomorphic-git` with an in-memory filesystem: shallow fetch, commit, push.
- **Contention handling.** The docs warn against using one shared repo as a queue for many agents.

Limits: 1 GB per repo, 32 MB per file, 2,000 git requests per 10 seconds per repo, and 1 TB per account (can be raised). All are far above a markdown knowledge base.

Pricing: $0.15 per 1,000 operations after 10,000 free per month, and $0.50 per GB-month after 1 GB free. Operations include create, push, pull, and clone. It is not documented whether binding reads (`readFile`, `log`, `readTree`) are billed operations, so the spike must confirm this. Storage is negligible: about 1,000 docs at 5 KB each, plus history, is about 20–50 MB per team. **Operations are the cost driver**, at about 33 times R2's write price. Keep Artifacts off the read path:

- **Reads (`kb_search`, `kb_read`, `kb_browse`)** are served from the derived index, which stores frontmatter, body, and the generated index pages. They never touch Artifacts.
- **Writes** go MCP → Worker API → a **Durable Object per team**. The Durable Object serializes writes, runs the dedupe gate and validation, regenerates the affected `index.md` in the same commit, and pushes once. This avoids the contention the Artifacts docs warn about.
- **Push events** → Queue → indexer Worker, which diffs the changed paths and upserts the index. Pushes made directly by humans with `git push` reach the index through the same events.
- **Local clones** (`clanker kb clone` mints a read token) fetch only when the index reports a new head SHA, never on a timer.

Rough cost for 100 teams, each making 500 agent writes and 2,000 change-triggered fetches per month: about 250,000 operations, roughly $36 per month, plus about $2 of storage. Polling every few minutes instead would push this into the hundreds of dollars.

Where the derived index lives: **Postgres** (already holds users, API keys, and the new team tables, and `packages/db/src/search.ts` already has full-text search) or **D1 FTS5** per team (better isolation and real BM25, but one more system). Lean Postgres for v1.

Spike before committing:

1. Measure which calls count as billed operations.
2. Measure `isomorphic-git` shallow fetch, commit, and push CPU time and latency in a Worker and in a Durable Object.
3. Confirm the push event fires for pushes made through the Worker and reaches the indexer within seconds.
4. Test `import` from a private GitHub repo.

## Write path: compile, don't append

The biggest quality lever. Karpathy's core point is that a new source updates existing pages instead of piling up duplicates.

`kb_write` flow:

1. The agent submits a draft (title, frontmatter, body).
2. The server runs `kb_search` on the title plus error signatures. If strong matches exist, it returns them with `status: possible_duplicate` and doesn't write.
3. The agent chooses between `update` on an existing path (merge a new root cause, add a variant, bump `last_verified`) and `create` with a justification.
4. On write, the server validates frontmatter against the schema. It reuses `assertReusableSolution` and the secret and path scrubbing from `learn.ts`, regenerates the affected `index.md` files, and appends to `log.md`.

`kb_confirm(path, worked, note)` replaces up and downvotes. It increments `confirmations` or records a failure note, and after N failures flips `status` to `stale`.

`clanker kb lint` (CLI and scheduled hosted job): finds duplicates (title and signature similarity), stale docs (`last_verified` older than X, or depending on an upgraded package version), orphans, broken links, missing frontmatter, and contradictions (optionally checked by an LLM).

## MCP tool surface

| Tool | Replaces | Purpose |
|---|---|---|
| `kb_search(query, area?, tags?, type?, status?, limit?)` | `search_solutions` | Ranked hits with snippets |
| `kb_browse(area?)` | (new) | Return `index.md` for the root or an area |
| `kb_read(path \| id)` | resources `clankeroverflow://repo/solutions/{id}` | Full document |
| `kb_write(draft, mode: create \| update, path?)` | `learn_solution`, `log_solution` | Write with dedupe gate |
| `kb_confirm(path, worked, note?)` | `upvote_solution`, `downvote_solution` | Feedback |
| `clanker_status` | same | Mode, KB root, doc count, index freshness |

Keep the old tool names as thin aliases for one CLI minor version, since the skill triggers and evals in `clankeroverflow-mcp-workspace/` depend on them.

## Teams model (hosted)

New tables in `packages/db`: `team`, `team_member (role: owner | editor | reader)`, `team_kb (storage: github | managed, repo, default_branch, write_policy: push | pr)`. Scope API keys to a team. Area-level permissions come later. V1 is all-or-nothing per team.

## What gets deleted

Once the markdown backend matches or beats current retrieval in evals:

- `packages/api/src/semantic/*`, the Vectorize and Workers AI bindings in `packages/infra/alchemy.run.ts`
- `packages/cli/src/mcp/local-semantic.ts`, `node-llama-cpp`, `sqlite-vec`, `benchmarks/local-embeddings`
- the hybrid and auto-fallback search modes (`auto-search.ts`)
- eventually `solution` and `solution_vote`, after migration

## Phases

1. **Spec freeze.** Answer the open questions below and lock the frontmatter schema and `AGENTS.md` template.
2. **Local markdown backend.** Add `MarkdownBackend` implementing the existing `SolutionBackend` interface in `packages/cli/src/mcp`, using MiniSearch, the new `kb_*` tools, and `clanker kb migrate`, which converts `solutions.sqlite` and `.clankeroverflow/solutions/*.md` using the existing export code. Run the `repo-stackoverflow` and `product-proof` evals against the SQLite FTS and hybrid baselines. **Exit criterion:** recall at 5 is no worse than hybrid.
3. **Write quality.** Dedupe gate, generated index and log, `kb confirm`, `kb lint`.
4. **Teams plus managed storage on Artifacts.** Run the spike above, then build the team tables, one Artifacts repo per team forked from a baseline, the per-team Durable Object writer, the push-event indexer, and `clanker kb clone`. GitHub import and mirroring come after.
5. **Web app.** Replace the public solutions feed with a team KB viewer (tree by area, search, doc page, lint report, activity from `log.md`), using the existing design system in `apps/web/src/index.css`. This is where the earlier UI redesign happens.
6. **Cleanup.** Remove the vector stack and the old tables. Optionally add option B (managed storage plus remote MCP).

## Risks

- **Retrieval regressions on paraphrased queries** ("page is stale after update" vs. "cache tags not invalidating"). BM25 has no synonyms. Mitigations: `aliases` written at authoring time, the agent retrying with reformulated queries (agentic search), and `kb_browse`. Optional later: an LLM reranker over the top 20.
- **Taxonomy drift** (teams invent `backend/` and `back-end/`). Mitigations: `AGENTS.md` lists the allowed areas and tags, and lint flags unknown ones.
- **Write noise** from agents logging trivia. The dedupe gate, `status: draft` until confirmed, and a PR write policy limit this.
- **Positioning.** Mosaic (YC, "shared memory for your team's agents") and ExtraContext are in this space. The differentiators are markdown in your own git repo, the compile/dedupe/lint discipline, and an open-source local mode.

## Open questions

1. **Public corpus.** Does the global public ClankerOverflow survive as a "public" team KB that anyone can read, or does the product become teams-only?
2. **Storage of record.** Artifacts as the managed default (B), with GitHub as an import or mirror (A)? Are we OK depending on a product in beta with Workers Paid as a requirement?
3. **Write policy default.** Direct commit or PR? Should agent-written docs start as `draft` until a human or a second agent confirms them?
4. **Area taxonomy.** Free-form, a fixed starter set (`backend`, `frontend`, `infra`, `data`, `finance`, `product`, `ops`), or defined per team in `AGENTS.md`?
5. **Scope of content.** Only verified fixes (current product), or also decisions, how-tos, and gotchas (a general team wiki)? A broader scope means more value but more noise.
6. **Repo-local vs. team-wide.** Should a repo's `.clankeroverflow/kb/` and the team KB both be searched, and if so with what precedence?
7. **Remote MCP.** Is a hosted Streamable HTTP MCP needed in v1, or is the local MCP plus a git clone enough for the agents you care about?
8. **Vectors.** Comfortable deleting the semantic stack if evals pass, or keep it as an opt-in reranker?
