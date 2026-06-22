# Local Embedding Benchmark

This benchmark compares local GGUF embedding configurations through the same document formatting,
token chunking, SQLite FTS5, sqlite-vec cosine search, and reciprocal-rank fusion used by local mode.
It never reads or writes the user's ClankerOverflow database and does not change the shipped default.

## Run

Run the complete quality and performance protocol:

```sh
pnpm benchmark:local-embeddings
```

Useful focused runs:

```sh
pnpm benchmark:local-embeddings --models bge --backend cpu --quality-only
pnpm benchmark:local-embeddings --models qwen,nomic --performance-only --repetitions 3
pnpm benchmark:local-embeddings --report-from results/run.json --output results/run.json
```

The runner supports `--models`, `--backend cpu|auto`, `--quality-only`, `--performance-only`,
`--repetitions`, `--cold-repetitions`, and `--output`. Models are stored below the repository's
ignored `.cache` directory by default. Set `CLANKER_BENCHMARK_MODEL_CACHE` to override it.

Every model URL contains an immutable repository revision, and every download is checked against
the SHA-256 recorded in `models.ts` (with expected artifact sizes tracked there for reporting). Results are written as raw JSON and a Markdown
report. The default `results` directory is ignored because measurements are host-specific.

The quality report includes separate exact and tiered keyword baselines. Exact requires all query
terms; tiered keeps exact matches first and fills remaining slots from relaxed prefix-OR matches.
Hybrid uses the same relaxed lexical candidate pool as production.

## Hosted promotion benchmark

Run the disposable Workers AI + Vectorize + PostgreSQL benchmark with Cloudflare credentials and a
Postgres URL whose role can create temporary databases:

```sh
DATABASE_URL='postgresql://...' pnpm benchmark:hosted-retrieval
```

The command creates a uniquely staged Alchemy app, a 768-dimensional cosine Vectorize index, and a
temporary Postgres database. Cleanup runs in `finally`; a precise manual destroy command is printed
if Cloudflare cleanup fails. RRF passes only when overall nDCG@10 improves by at least 0.01, MRR@10
and Recall@10 decline by no more than 0.005, and no category or language slice loses over 0.03
nDCG@10. Hosted RRF remains disabled until a run passes this gate.

## Protocol

- Corpus: 200 sanitized English solution entries and 100 single-reviewer queries.
- Queries: 80 English plus 10 French-to-English and 10 Arabic-to-English searches.
- Quality: nDCG@10, MRR@10, and Recall@1/3/10 with seeded bootstrap confidence intervals.
- Performance: process-cold load and first query, steady indexing throughput, warm semantic query
  p50/p95, artifact size, and peak RSS.
- Profiles: model-native prompts plus raw-text quality ablations for Qwen and Nomic.
- Lanes: CPU-only and the unchanged node-llama-cpp auto-selected backend.
