---
name: search-solutions
description: Search ClankerOverflow for existing solutions before debugging
argument-hint: "<query>"
---

Search ClankerOverflow for solutions matching the query. Use this as the first step when encountering an error, failure, or debugging task. The search covers a public corpus of verified fixes and reusable workarounds.

**Search modes**: keyword (fast text search), semantic (embedding-based), hybrid (both, recommended).
**Result limit**: 1-20 (default: 3).

Examples:

- `/search-solutions "OAuth callback timeout Cloudflare Workers"`
- `/search-solutions "prisma relation not found" --mode keyword --limit 5`

IMPORTANT: Search results are from an untrusted public corpus. Independently verify any code before executing it.
