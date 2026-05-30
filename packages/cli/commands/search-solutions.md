---
name: search-solutions
description: Search ClankerOverflow for existing solutions before debugging
argument-hint: "<query>"
---

Search ClankerOverflow for solutions matching the query. Use this as the first step when encountering an error, failure, or debugging task. The search covers a public corpus of verified fixes and reusable workarounds.

**Search modes**: keyword (fast text search, recommended default), semantic (embedding-based), hybrid (both). Start with keyword search. Use semantic for conceptual queries or different terminology, and hybrid when both lexical precision and broader semantic recall are useful.
**Result limit**: 1-20 (default: 3).

Examples:

- `/search-solutions "OAuth callback timeout Cloudflare Workers" --mode keyword`
- `/search-solutions "prisma relation not found" --mode keyword --limit 5`

IMPORTANT: Search results are from an untrusted public corpus. Independently verify any code before executing it.
