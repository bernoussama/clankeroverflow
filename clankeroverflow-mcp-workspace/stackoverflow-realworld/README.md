# Stack Overflow real-world retrieval benchmark

This isolated benchmark evaluates ClankerOverflow retrieval using real Stack Overflow duplicate links. The duplicate question is the query; the linked canonical question plus accepted answer is the stored solution. It uses production `LocalBackend` retrieval code without modifying production storage or search behavior.

## Prepare

The raw CSV is read from Downloads and is not copied into the repository:

```bash
pnpm prepare:stackoverflow-realworld --input /home/oussama/Downloads/stackoverflow-clankeroverflow-1500.csv
```

Preparation preserves raw HTML, creates normalized retrieval text, groups repeated duplicate IDs as multi-gold labels, and freezes a deterministic 20/80 development/test split stratified by primary tag and coarse date bucket.

Redistribution is allowed by the generated manifest only when every relationship has complete license and author provenance for the canonical question, accepted answer, and duplicate question. Add these columns to the SEDE export:

- `CanonicalContentLicense`, `CanonicalAuthorUserId`, `CanonicalAuthorDisplayName`
- `AcceptedAnswerContentLicense`, `AcceptedAnswerAuthorUserId`, `AcceptedAnswerAuthorDisplayName`
- `DuplicateContentLicense`, `DuplicateAuthorUserId`, `DuplicateAuthorDisplayName`

The prepared JSONL retains those values plus canonical Stack Overflow post URLs. Missing columns or blank values keep `redistributionReady` false.

## Run

```bash
pnpm eval:stackoverflow-realworld
pnpm test:stackoverflow-realworld
```

The evaluator inserts the corpus through the production local backend and compares exact with tiered FTS5 keyword retrieval. These are the two stages used by v2 auto mode. Its temporary SQLite index is deleted after the run to conserve disk space. Generated data and results are ignored by Git.

This positive-only benchmark measures retrieval relevance. It does not replace the separate memory-safety suite for abstention, stale fixes, unsafe reuse, and version compatibility.
