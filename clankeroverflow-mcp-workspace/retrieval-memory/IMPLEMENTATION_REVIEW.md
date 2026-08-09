# Implementation Review: Memory Research and Retrieval Benchmark

Reviewed: 2026-08-08

## Executive conclusion

**Verdict: needs revision before the benchmark results are used to choose or promote a production retrieval architecture.**

The implementation is a useful isolated harness. It keeps production storage and retrieval unchanged, creates the requested 30-family/210-case dataset, validates the core schema, emits per-query traces, calibrates thresholds from the development split, and passes its declared unit, type, lint, and formatting checks. Two repeated offline runs also produced the same ranking fingerprint.

The current headline comparison is not decision-grade, however. The reported `reranker` method is neither hybrid candidate generation plus the pinned cross-encoder nor a complete cached representation of that model. Three selectively cached scores also target held-out labels. In addition, the development/test split is segregated by technical stratum, and the structured method receives exact constraint labels that make its safety result an oracle-style upper bound. These issues affect the interpretation of the principal results rather than just documentation polish.

## Scope

This review covers the benchmark implementation under `clankeroverflow-mcp-workspace/retrieval-memory/` and the root configuration changes needed to run it. The concurrent root `README.md` edits documenting `learn_solution` and `clanker_status` are unrelated to the retrieval benchmark and were not assessed as part of its acceptance.

## Findings

### [P1] The reported reranker does not implement the planned hybrid-plus-cross-encoder method

The plan defines method 4 as hybrid retrieval followed by the pinned `Xenova/ms-marco-MiniLM-L-6-v2` cross-encoder. The implementation computes `hybridResults`, but the reranker path does not use those candidates or their order (`retrieval.ts:450-459`, `retrieval.ts:477-500`). It scores all 150 solutions, and `methodScoreMap` ranks solely by `rerankerScores` (`retrieval.ts:319-328`, `retrieval.ts:365-372`).

The default benchmark also selects `rerankerMode: "fixture"` (`run.ts:91-100`, `run.ts:184-197`). Only seven query/solution pairs have committed fixture scores; every unmatched pair is scored by deterministic token Jaccard plus a hash tie-breaker (`reranker.ts:32-47`, `reranker.ts:66-79`, `reranker-fixtures.json:1-37`). On the held-out split, that means 3 of 21,000 scored pairs use fixture overrides and 20,997 use Jaccard. The generated report correctly identifies the provider as `fixture-v1`, but still presents the row as `reranker` beside the real keyword/embedding/hybrid methods.

The model pin itself is appropriate: the [Xenova model card](https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2/blob/e746e4abf0750f080e1e996a20dfcb32482661f2/README.md) identifies it as the Transformers.js/ONNX conversion of the cross-encoder, and the [upstream model card](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2) describes reranking passages retrieved by a first-stage system. The defect is in the evaluated pipeline, not the selected model.

**Impact:** The reported reranker quality, abstention, and latency figures do not measure the method named in the plan. They should not be compared as cross-encoder evidence or used to choose a reranking architecture.

**Required remediation:** Generate a bounded hybrid candidate set, pass exactly those candidates to the pinned cross-encoder, and rank by cross-encoder score with a deterministic tie policy. Produce the canonical report with `model.reranker` and `rerankerRevision` set to the pinned model/revision. Keep the Jaccard adapter only as a separately named test double, not as the public benchmark method.

### [P1] Selective fixture overrides contaminate the held-out reranker evaluation

Three of the seven committed reranker overrides are attached to held-out cases:

- `prisma-neon-direct-url-same-error-different-root-cause` gives the relevant alternate-root solution `0.96`.
- `node-eaddrinuse-timewait-no-useful-memory` gives the canonical distractor `0.02`.
- `systemd-user-environment-related-adaptation` gives the relevant adaptation plan `0.89`.

These entries are selected by benchmark case and solution IDs and receive label-aligned extreme scores, while all other held-out pairs use the unrelated Jaccard fallback. The fixture file records no model-generation command, model output provenance, or complete score matrix. The tests only assert one development fixture value and the adapter identity (`retrieval-adapters.test.ts:110-124`); they do not prevent held-out label-specific overrides.

**Impact:** The held-out reranker results are not independent of benchmark labels. Even if the seven values originated from a model run, selectively applying only these pairs changes the test distribution and makes the reported metrics non-reproducible from the pinned model alone.

**Required remediation:** Remove selective case-specific overrides from canonical evaluation. If cached inference is required, generate every evaluated candidate score from the pinned model before metric calculation, store generation provenance and a checksum, and add validation that fixture coverage is complete and no fallback executes. Test doubles should use synthetic case IDs outside the benchmark splits.

### [P1] The development and test splits are category-balanced but not stratum-balanced

`splitForFamily` assigns the first ten families to development and all remaining families to test (`fixtures.ts:253-268`). Because `familyDefinitions` is grouped by stratum, development contains only:

- 35 JavaScript/tooling cases;
- 35 web/auth/SSR cases.

The test split contains only:

- 35 database cases;
- 35 cloud-runtime cases;
- 35 Python/ML cases;
- 35 CI/OS/devtools cases.

The validator checks five families per stratum globally and 10/20 development/test cases per category, but never checks stratum distribution within each split (`validate.ts:24-47`, `validate.ts:101-104`). The schema test is titled “balanced strata/splits” while asserting the same two independent properties rather than their cross-product (`schema.test.ts:7-33`).

**Impact:** Abstention thresholds are tuned on domains absent from the test set. The resulting scores combine retrieval quality with an undisclosed domain-shift experiment, so threshold transfer and method comparisons cannot be attributed cleanly to the retrieval methods.

**Required remediation:** Define the split explicitly at family construction and distribute every stratum across development and test, or deliberately retain a cross-domain split but name and report it as such. Add validation for per-split stratum counts and publish those counts in the Markdown report.

### [P2] Structured retrieval is evaluated with oracle-style constraints but reported beside ordinary query retrieval

The structured method receives `requiredConstraints` directly from generated ground truth. Same-error cases include the exact alternate `rootCauseKey` (`fixtures.ts:373-379`); lexical negatives use a guaranteed-nonmatching synthetic root cause (`fixtures.ts:334-340`); and no-useful cases use a guaranteed-unknown repository and root cause (`fixtures.ts:406-413`). The retrieval path applies these labels as hard filters to every solution (`retrieval.ts:462-475`).

This construction explains why the held-out structured row reaches 100% abstention F1, 100% no-useful-memory accuracy, and 0% constraint violations. Those are useful upper-bound results if the caller already knows the true repository and root-cause discriminator, but the report does not identify them as an oracle-constraint condition (`report.ts:118-126`). Production storage/retrieval also remains flat and unchanged, so the benchmark does not demonstrate how those exact constraints would be inferred from a real query.

**Impact:** Readers can reasonably interpret the structured row as a directly deployable retrieval improvement when it partly measures access to answer-derived metadata.

**Required remediation:** Label the current method `structured-oracle` or equivalent. Add a non-oracle condition using only constraints available before retrieval, including missing/noisy metadata, and report both conditions separately. Preserve the oracle row as an upper bound rather than removing it.

### [P2] The required report and raw results are excluded from version control

The entire `clankeroverflow-mcp-workspace/retrieval-memory/results` directory is ignored (`.gitignore:48-50`). The requested raw JSON and public Markdown report exist locally, but they are absent from the reviewable change and will not be available in a clean checkout. The README calls this a “checked-in-style output layout” while only documenting how to regenerate it (`README.md:43-47`).

**Impact:** A reviewer can inspect the generator but not the exact accepted artifact. This falls short of the plan's deliverable requiring a reproducible Markdown report and raw JSON results, and it makes future regression comparison dependent on rerunning the benchmark in the same environment.

**Required remediation:** Track at least a canonical Markdown report and a compact, normalized summary JSON with dataset/model/config fingerprints. The large per-query trace JSON may remain an ignored or published artifact if size is a concern, but the report should link to an immutable checksum/location.

### [P2] The research matrix is linked, but its claims are not traceable to paper sections or versions

`research-matrix.md` provides one latest-version paper link in each column header, followed by 100 compact claim cells. It does not cite page, section, quoted evidence, or a pinned paper version per claim. Some cells are cautious and marked “not explicit,” which is good, but a reader cannot efficiently distinguish source-supported observations from synthesis without reopening and searching every paper.

**Impact:** The matrix satisfies citation presence at a coarse level, but it is not audit-ready enough to support the architecture recommendations as a research artifact.

**Required remediation:** Add a source-notes section per paper with pinned version, section/page anchors, and short paraphrased evidence for the claims used in the matrix. Keep recommendations in their existing separate section.

### [P3] The repeatability fingerprint covers rankings, not the generated artifacts

`repeatabilityFingerprint` hashes only `rawRanking`, `returnedIds`, and `abstained` (`metrics.ts:397-413`). It omits scores, explanation traces, thresholds, metric values, model settings, and dataset content. Two review runs produced the same fingerprint, `488d1efa093b4b866caca00ccf27e7aa15642925d0c79c79756bd6a47355e477`, and identical JSON after removing latency and output paths. Their raw JSON and Markdown checksums differed because measured latency and artifact paths differ.

**Impact:** The fingerprint supports stable ranking claims but is too narrow to establish that the generated artifacts or all reported evidence are unchanged.

**Required remediation:** Add separate hashes for the dataset snapshot, model/config identity, normalized per-query result payload, and normalized report inputs. Treat latency as explicitly nondeterministic and exclude it from the canonical quality checksum.

## What is solid

- Production code paths and database schema remain unchanged; the benchmark is isolated.
- The generated dataset has exactly 30 families, 150 solution fixtures, and 210 cases with the requested 70/140 case split and 30 cases per category.
- IDs, relationships, safety labels, structured constraints, dangerous distractors, and no-useful cases receive meaningful schema validation.
- Threshold tuning is wired to development cases before held-out test evaluation (`run.ts:213-250`). No direct test-case input is passed to `calibrateAbstention`.
- Explanation traces include lexical/semantic rank, fusion and reranker scores, fingerprints, constraint checks, status, confidence, and relationship evidence.
- The pinned cross-encoder path is implemented as an opt-in integration and the model/revision pin is valid.
- The report includes confidence intervals, category slices, safety/abstention metrics, latency, model/cache identity, and explicit warnings for deterministic embeddings and fixture reranking.

## Validation performed

| Check                            | Result                                                                      |
| -------------------------------- | --------------------------------------------------------------------------- |
| `pnpm test:memory-retrieval`     | Pass: 4 files, 13 tests                                                     |
| Benchmark TypeScript check       | Pass                                                                        |
| `pnpm run check-types`           | Pass                                                                        |
| `pnpm run lint`                  | Pass with pre-existing warnings outside the benchmark                       |
| `pnpm exec oxfmt --check`        | Pass: 403 tracked files                                                     |
| `git diff --check`               | Pass                                                                        |
| Two full offline benchmark runs  | Same ranking fingerprint and normalized quality output                      |
| Raw artifact byte comparison     | Different, due to latency measurements and output paths                     |
| Transformers.js integration test | Not run; opt-in model download/cache path remains unverified in this review |

An explicit format check that included the ignored `results/` directory found formatting differences in the three generated artifacts. The repository-wide formatter passes because ignored artifacts are excluded. This is another reason to define a canonical normalized artifact if results become tracked.

## Recommended remediation order

1. Correct the reranker pipeline and remove held-out selective fixture overrides.
2. Rebuild or explicitly relabel the split so calibration and held-out claims are interpretable.
3. Separate structured-oracle and non-oracle structured conditions.
4. Regenerate the canonical benchmark with the pinned model, complete provenance, and no fallback scoring.
5. Track or publish normalized report artifacts and stronger checksums.
6. Add tests that fail when reranking bypasses hybrid candidates, fixture coverage is partial, test-label overrides exist, or split strata are unbalanced.
7. Upgrade the research matrix to pinpoint citations.

## Acceptance recommendation

Accept the current work as a **benchmark prototype and schema/retrieval pressure-test harness**. Do not accept the generated headline metrics as evidence for selecting a reranker or structured production strategy until all P1 findings are resolved and the canonical report is regenerated. The P2 items should be resolved before presenting the report externally.
