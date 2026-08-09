# Memory retrieval benchmark

This is a separate benchmark for memory safety, abstention, version compatibility, provenance, and plan reuse. It does not modify the production solution schema or retrieval path and does not replace the existing 200-document/100-query embedding benchmark.

The dataset has 30 fix families across six strata. Each family produces five structured solution fixtures and seven cases, for 210 cases total:

- 70 development cases and 140 held-out test cases;
- 30 cases per category, with 10 development and 20 test cases in each category;
- direct reuse, related adaptation, lexical irrelevance, different version, same error/different root cause, stale/reverted, and no useful memory.

## Run

```bash
pnpm eval:memory-retrieval \
  --split test \
  --methods keyword,embedding,hybrid,reranker,structured \
  --offline \
  --output clankeroverflow-mcp-workspace/retrieval-memory/results/test.json
```

The command always evaluates the development split first to tune abstention thresholds. Those thresholds are frozen before test metrics are calculated. `--split all` writes both split results into one report.

Routine runs use the deterministic embedding adapter through the existing `LocalBackend` SQLite/vector path and committed cached reranker fixtures. This keeps tests offline and reproducible. To use the existing local BGE embedder, provide a cached GGUF model:

```bash
pnpm eval:memory-retrieval \
  --split test \
  --embedding-mode local \
  --embedding-model /path/to/bge-small-en-v1.5-q8_0.gguf \
  --reranker-mode fixture
```

To run the pinned Transformers.js reranker, use a writable cache on the first run and then add `--offline` for subsequent runs:

```bash
pnpm eval:memory-retrieval \
  --split test \
  --reranker-mode transformers \
  --model-cache .cache/clankeroverflow-memory-retrieval \
  --offline
```

The reranker is `Xenova/ms-marco-MiniLM-L-6-v2` at revision `e746e4abf0750f080e1e996a20dfcb32482661f2`. Transformers.js supports pinned Hub revisions, custom cache directories, and `local_files_only` loading; see the [pipeline options documentation](https://huggingface.co/docs/transformers.js/en/pipelines) and [Hub loading options](https://huggingface.co/docs/transformers.js/v3.0.0/api/utils/hub).

Use `--write-fixtures path/to/fixtures.json` to export the validated generated dataset. Raw result JSON contains per-query rankings and bounded explanation traces: selected/ranked candidates, dangerous distractors, and every candidate rejected by structured constraints, including constraint checks and typed relationship evidence. The Markdown report is intended for public-style comparison and explicitly does not promote a production strategy.

The checked-in-style output layout used by the implementation is `results/memory-retrieval-test.json`, `results/memory-retrieval-test.md`, and `results/fixtures.json`; rerun the command above with those paths to regenerate them.

## Tests

```bash
pnpm test:memory-retrieval
pnpm test:memory-retrieval:integration
```

The first command is network-independent and uses cached fixture scores. The integration test is opt-in with `MEMORY_RERANKER_INTEGRATION=1`; it verifies model download/cache loading and one text-pair inference, so it may require network access and a model cache.
