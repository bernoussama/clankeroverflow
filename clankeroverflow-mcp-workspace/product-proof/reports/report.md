# ClankerOverflow MCP Reuse Benchmark

> Status: benchmark report generated from recorded run files.

## Headline Metrics

| Metric                    |       Result |
| ------------------------- | -----------: |
| Known Fix Trigger Recall  |  95% (37/39) |
| Known Fix Retrieval Rate  |  84% (43/51) |
| Learned Reuse Pass Rate   |  67% (10/15) |
| MCP Win Rate              |    n/a (0/0) |
| Decisive MCP Win Rate     |    n/a (0/0) |
| Must-search Recall        |  95% (37/39) |
| Must-not-search Precision | 100% (72/72) |
| Useful Retrieval Rate     |  84% (43/51) |
| Unsafe-copying Rate       |   0% (0/210) |
| Failed Recorded Runs      |            0 |
| Fixture Preflight         | 100% (67/67) |

## Rediscovery Cost

| Comparison                    |             Median Savings |
| ----------------------------- | -------------------------: |
| Known fix vs empty DB         |   +384 tokens (39 samples) |
| Known fix vs no MCP           | -38521 tokens (39 samples) |
| Known fix vs empty DB elapsed |      +2983 ms (39 samples) |
| Known fix vs no MCP elapsed   |      -3589 ms (39 samples) |

## Debugging Cost Savings

| Metric                             |          Result |
| ---------------------------------- | --------------: |
| Solved matched pairs               |               0 |
| Total-token savings vs no MCP      | n/a (0 samples) |
| Total-token savings rate vs no MCP | n/a (0 samples) |
| Elapsed savings vs no MCP          | n/a (0 samples) |
| Elapsed savings rate vs no MCP     | n/a (0 samples) |
| Claim gate                         |         not met |

## Coverage

- Scenarios: 38
- Sanitized fixture fixes: 17
- Recorded runs: 300 (300 real, 0 sample)
- Failed recorded runs excluded from behavior metrics: 0

| Label           | Scenarios |
| --------------- | --------: |
| must_search     |        21 |
| must_not_search |        12 |
| allowed_search  |         5 |

## Methodology

- Compare MCP-agent runs with a known fixture, an empty/distractor database, and no ClankerOverflow MCP.
- Grade trigger behavior, useful retrieval, learned logging/reuse, final answer facts, unsafe copying, and pairwise answer quality.
- Debug-workspace savings require both compared runs to pass the scenario verification command.
- Use local fixture data for core reproducibility; hosted smoke is optional and excluded from headline metrics.
- Treat `allowed_search` cases as qualitative notes rather than hard precision failures.
- V1 outcome evidence is measured with Codex; the MCP protocol behavior is designed to be portable to other MCP-capable agents.

## Known Fix Recovery

- Trigger recall: 95% (37/39)
- Useful retrieval: 84% (43/51)
- Unsafe copying: 0% (0/210)

## Learned Reuse Loop

- Pass rate: 67% (10/15)
- Pass 1 expects search, no useful known-fixture retrieval, a reusable final answer, and `log_solution`.
- Pass 2 expects search and retrieval of the logged local solution.

## Negative Controls

- Must-not-search precision: 100% (72/72)
- Preference, conceptual, trivial UI, and private/business-logic tasks should avoid ClankerOverflow search.

## Representative Examples

No reviewed pairs yet.

## Failure Analysis

- Failed recorded runs excluded from behavior metrics: 0
- Missed required searches: 2
- False-positive searches on must-not-search tasks: 0
- Retrieval misses after search: 8
- Borderline allowed-search cases observed: 30

## Fixture Preflight Misses

None.

## Optional Hosted Smoke

Not run. Use `--hosted-smoke` when credentials/network are available.

## Caveats

- Human review is required before using MCP Win Rate in buyer-facing material.
- Sample runs are only harness validation data and must be excluded or replaced for published claims.
- Cost estimates appear only when a pricing config is supplied; otherwise token/time deltas are reported without dollar claims.
- Hosted search availability can be reported separately, but it is intentionally not part of the reproducible core score.

Generated from `product-proof` product-proof fixtures.
