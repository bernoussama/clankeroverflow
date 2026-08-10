# ClankerOverflow keyword memory-safety benchmark

This isolated suite evaluates the production v2 SQLite FTS5 keyword path against frozen cases for safe reuse, abstention, stale fixes, version compatibility, wrong root causes, provenance, and plan reuse.

```bash
pnpm eval:memory-retrieval -- --split test
pnpm test:memory-retrieval
```

The development split calibrates the abstention threshold. The test split stays held out for the reported metrics. Runs are offline and do not require an embedding model, vector extension, or model cache.
