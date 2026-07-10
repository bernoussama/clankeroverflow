# ClankerOverflow MCP Reuse Benchmark

> Status: benchmark report generated from recorded run files.

## Headline Metrics

| Metric                    |       Result |
| ------------------------- | -----------: |
| Known Fix Trigger Recall  |    88% (7/8) |
| Known Fix Retrieval Rate  |    88% (7/8) |
| Learned Reuse Pass Rate   |    n/a (0/0) |
| MCP Win Rate              |    n/a (0/0) |
| Decisive MCP Win Rate     |    n/a (0/0) |
| Must-search Recall        |    88% (7/8) |
| Must-not-search Precision |    n/a (0/0) |
| Useful Retrieval Rate     |    88% (7/8) |
| Unsafe-copying Rate       |    0% (0/16) |
| Failed Recorded Runs      |            0 |
| Fixture Preflight         | 100% (67/67) |

## Rediscovery Cost

| Comparison                    |            Median Savings |
| ----------------------------- | ------------------------: |
| Known fix vs empty DB         | -13293 tokens (8 samples) |
| Known fix vs no MCP           | -51639 tokens (8 samples) |
| Known fix vs empty DB cost    |           n/a (0 samples) |
| Known fix vs no MCP cost      |           n/a (0 samples) |
| Known fix vs empty DB elapsed |      -8453 ms (8 samples) |
| Known fix vs no MCP elapsed   |     -33655 ms (8 samples) |

## Debugging Cost Savings

| Metric                                |                          Result |
| ------------------------------------- | ------------------------------: |
| Solved matched pairs                  |                               6 |
| Total-token savings vs no MCP         |       -37560 tokens (6 samples) |
| Total-token savings rate vs no MCP    |                -31% (6 samples) |
| Estimated cost savings vs no MCP      |                 n/a (0 samples) |
| Estimated cost savings rate vs no MCP |                 n/a (0 samples) |
| Elapsed savings vs no MCP             |           -30182 ms (6 samples) |
| Elapsed savings rate vs no MCP        |               -105% (6 samples) |
| Claim gate                            | not met (token proxy + elapsed) |

## Coverage

- Scenarios: 38
- Sanitized fixture fixes: 17
- Recorded runs: 24 (24 real, 0 sample)
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
- V1 outcome evidence in this report is measured with claude-cli; the MCP protocol behavior is designed to be portable to other MCP-capable agents.

## Known Fix Recovery

- Trigger recall: 88% (7/8)
- Useful retrieval: 88% (7/8)
- Unsafe copying: 0% (0/16)

## Learned Reuse Loop

- Pass rate: n/a (0/0)
- Pass 1 expects search, no useful known-fixture retrieval, a reusable final answer, and `log_solution`.
- Pass 2 expects search and retrieval of the logged local solution.

## Negative Controls

- Must-not-search precision: n/a (0/0)
- Preference, conceptual, trivial UI, and private/business-logic tasks should avoid ClankerOverflow search.

## Representative Examples

No reviewed pairs yet.

## Failure Analysis

- Failed recorded runs excluded from behavior metrics: 0
- Missed required searches: 1
- False-positive searches on must-not-search tasks: 0
- Retrieval misses after search: 1

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
