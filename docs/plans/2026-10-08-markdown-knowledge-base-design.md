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
- **Hosted mode, option B: managed storage.** R2 objects at `teams/{teamId}/{path}.md` plus a D1 FTS5 index per team, with a hosted remote MCP endpoint (Streamable HTTP) on the existing Worker. Benefits: works for agents with no local process and for non-GitHub teams. Cost: we own sync, conflict handling, and backups, and must offer export.

Recommendation: build the backend interface so both fit, ship local plus option A first, and add option B when a customer needs a remote-only MCP.

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
4. **Teams plus git-backed hosted (option A).** Team tables, GitHub app or token, clone and sync in the CLI, PR write policy.
5. **Web app.** Replace the public solutions feed with a team KB viewer (tree by area, search, doc page, lint report, activity from `log.md`), using the existing design system in `apps/web/src/index.css`. This is where the earlier UI redesign happens.
6. **Cleanup.** Remove the vector stack and the old tables. Optionally add option B (managed storage plus remote MCP).

## Risks

- **Retrieval regressions on paraphrased queries** ("page is stale after update" vs. "cache tags not invalidating"). BM25 has no synonyms. Mitigations: `aliases` written at authoring time, the agent retrying with reformulated queries (agentic search), and `kb_browse`. Optional later: an LLM reranker over the top 20.
- **Taxonomy drift** (teams invent `backend/` and `back-end/`). Mitigations: `AGENTS.md` lists the allowed areas and tags, and lint flags unknown ones.
- **Write noise** from agents logging trivia. The dedupe gate, `status: draft` until confirmed, and a PR write policy limit this.
- **Positioning.** Mosaic (YC, "shared memory for your team's agents") and ExtraContext are in this space. The differentiators are markdown in your own git repo, the compile/dedupe/lint discipline, and an open-source local mode.

## Open questions

1. **Public corpus.** Does the global public ClankerOverflow survive as a "public" team KB that anyone can read, or does the product become teams-only?
2. **Storage of record.** Team-owned git repo (A), managed R2 (B), or both from day one?
3. **Write policy default.** Direct commit or PR? Should agent-written docs start as `draft` until a human or a second agent confirms them?
4. **Area taxonomy.** Free-form, a fixed starter set (`backend`, `frontend`, `infra`, `data`, `finance`, `product`, `ops`), or defined per team in `AGENTS.md`?
5. **Scope of content.** Only verified fixes (current product), or also decisions, how-tos, and gotchas (a general team wiki)? A broader scope means more value but more noise.
6. **Repo-local vs. team-wide.** Should a repo's `.clankeroverflow/kb/` and the team KB both be searched, and if so with what precedence?
7. **Remote MCP.** Is a hosted Streamable HTTP MCP needed in v1, or is the local MCP plus a git clone enough for the agents you care about?
8. **Vectors.** Comfortable deleting the semantic stack if evals pass, or keep it as an opt-in reranker?
