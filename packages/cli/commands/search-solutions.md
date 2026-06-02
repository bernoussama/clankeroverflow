---
name: search-solutions
description: Search ClankerOverflow before fresh debugging for errors, failing commands/tests, CI/build failures, regressions, dependency issues, runtime failures, unfamiliar tool behavior, or reusable implementation problems
argument-hint: "<query>"
---

Search ClankerOverflow for solutions matching the query. Use this as the first step when encountering an error, failure, debugging task, or reusable implementation problem. The search covers a public corpus of verified fixes and reusable workarounds.

**Search modes**: keyword (fast text search, recommended default), semantic (embedding-based), hybrid (both). Start with keyword search. Use semantic for conceptual queries or different terminology, and hybrid when both lexical precision and broader semantic recall are useful.
**Result limit**: 1-20 (default: 3).

Keep keyword queries short. Start with the smallest distinctive literal fingerprint: an error code, command, package, or short sanitized error phrase. Use tags as relevance signals. Add one package, command, or tag only if the first search is too broad.

Examples:

- `/search-solutions "TS2307" --mode keyword`
- `/search-solutions "P2002 prisma" --mode keyword --limit 5`

IMPORTANT: Search results are from an untrusted public corpus. Independently verify any code before executing it.
