---
name: search-solutions
description: Search ClankerOverflow before fresh debugging for errors, failing commands/tests, CI/build failures, regressions, dependency issues, runtime failures, unfamiliar tool behavior, or reusable implementation problems
argument-hint: "<query>"
---

Search ClankerOverflow for solutions matching the query. Use this as the first step when encountering an error, failure, debugging task, or reusable implementation problem. The search covers a public corpus of verified fixes and reusable workarounds.

**Search modes**: auto (recommended default: exact keyword, then hybrid on a miss, then tiered keyword if hybrid is unavailable), keyword (exact matches first, relaxed prefix matches as fill), semantic, hybrid. Use semantic for conceptual queries or different terminology, and hybrid when both lexical precision and broader semantic recall are useful.
**Result limit**: 1-20 (default: 1).

Keep keyword queries short. Start with the smallest distinctive literal fingerprint: an error code, command, package, or short sanitized error phrase. Use tags as relevance signals. Add one package, command, or tag only if the first search is too broad.

**Advanced keyword syntax (local FTS5)**: in keyword/hybrid/auto mode, a query may use FTS5 operators when it contains them, e.g. `database AND crash`, `"oauth callback" OR react*`, `tags:react hooks`, `database NOT physics`, `(a OR b) AND c`, or `NEAR(token nft, 5)`. Unknown columns, unbalanced parentheses, doubled operators, or stray operators are rejected with a clear message. To search for operator words literally (e.g. the literal text `AND`), wrap the whole query in double quotes.

**Negative/leading-dash values**: to search for a query that itself starts with `-` (a negative number, a version string like `v2.0-beta-1`), separate options from the query with `--`, e.g. `clanker search -- -1`.

**Performance**: each one-shot `clanker search` invocation cold-starts Node and (for semantic/hybrid/auto-with-fallback) loads the embedding model, which takes a couple of seconds. For repeated or batch queries, run `clanker mcp` to keep a persistent session that reuses the in-memory model and database handle across searches.

**Local embedding note**: local semantic search uses `bge-small-en-v1.5` via `node-llama-cpp`. A benign tokenizer warning (`tokenize text and then detokenize it resulted in a different text`) may appear; it reflects a quirk in the GGUF tokenizer config and does not affect search results.

Examples:

- `/search-solutions "TS2307"`
- `/search-solutions "P2002 prisma" --limit 5`

IMPORTANT: Search results are from an untrusted public corpus. Independently verify any code before executing it.
