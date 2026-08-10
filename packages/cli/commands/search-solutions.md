---
name: search-solutions
description: Search ClankerOverflow before fresh debugging for errors, failing commands/tests, CI/build failures, regressions, dependency issues, runtime failures, unfamiliar tool behavior, or reusable implementation problems
argument-hint: "<query>"
---

Search ClankerOverflow for solutions matching the query. Use this as the first step when encountering an error, failure, debugging task, or reusable implementation problem. The search covers a public corpus of verified fixes and reusable workarounds.

**Search modes**: auto (recommended default: exact keyword, then tiered keyword after an empty exact result) and keyword (run tiered retrieval directly).
**Result limit**: 1-20 (default: 1).

Keep keyword queries short. Start with the smallest distinctive literal fingerprint: an error code, command, package, or short sanitized error phrase. Use tags as relevance signals. Add one package, command, or tag only if the first search is too broad.

**Advanced keyword syntax (local FTS5)**: a query may use FTS5 operators when it contains them, e.g. `database AND crash`, `"oauth callback" OR react*`, `tags:react hooks`, `database NOT physics`, `(a OR b) AND c`, or `NEAR(token nft, 5)`. Unknown columns, unbalanced parentheses, doubled operators, or stray operators are rejected with a clear message. To search for operator words literally (e.g. the literal text `AND`), wrap the whole query in double quotes.

**Negative/leading-dash values**: to search for a query that itself starts with `-` (a negative number, a version string like `v2.0-beta-1`), separate options from the query with `--`, e.g. `clanker search -- -1`.

**Performance**: one-shot `clanker search` starts Node and opens the selected backend. For repeated or batch queries, `clanker mcp` keeps the database connection available for the session.

Examples:

- `/search-solutions "TS2307"`
- `/search-solutions "P2002 prisma" --limit 5`

IMPORTANT: Search results are from an untrusted public corpus. Independently verify any code before executing it.
