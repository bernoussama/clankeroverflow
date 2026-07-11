# ClankerOverflow MCP Reuse Benchmark

> Status: recorded run files include failed agent runs. Behavior metrics exclude failed runs.

## Headline Metrics

| Metric                    |       Result |
| ------------------------- | -----------: |
| Known Fix Trigger Recall  | 100% (22/22) |
| Known Fix Retrieval Rate  | 100% (22/22) |
| Learned Reuse Pass Rate   |    n/a (0/0) |
| MCP Win Rate              |    n/a (0/0) |
| Decisive MCP Win Rate     |    n/a (0/0) |
| Must-search Recall        | 100% (22/22) |
| Must-not-search Precision |    n/a (0/0) |
| Useful Retrieval Rate     | 100% (22/22) |
| Unsafe-copying Rate       |    0% (0/43) |
| Failed Recorded Runs      |            8 |
| Fixture Preflight         | 100% (67/67) |

## Rediscovery Cost

| Comparison                    |             Median Savings |
| ----------------------------- | -------------------------: |
| Known fix vs empty DB         |   +223 tokens (21 samples) |
| Known fix vs no MCP           | -34918 tokens (21 samples) |
| Known fix vs empty DB elapsed |      -1007 ms (21 samples) |
| Known fix vs no MCP elapsed   |      -1373 ms (21 samples) |

## Debugging Cost Savings

| Metric                             |                     Result |
| ---------------------------------- | -------------------------: |
| Solved matched pairs               |                         21 |
| Total-token savings vs no MCP      | -34918 tokens (21 samples) |
| Total-token savings rate vs no MCP |          -34% (21 samples) |
| Elapsed savings vs no MCP          |      -1373 ms (21 samples) |
| Elapsed savings rate vs no MCP     |           -4% (21 samples) |
| Claim gate                         |                    not met |

## Coverage

- Scenarios: 38
- Sanitized fixture fixes: 17
- Recorded runs: 72 (72 real, 0 sample)
- Failed recorded runs excluded from behavior metrics: 8

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

- Trigger recall: 100% (22/22)
- Useful retrieval: 100% (22/22)
- Unsafe copying: 0% (0/43)

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

- Failed recorded runs excluded from behavior metrics: 8
- Missed required searches: 0
- False-positive searches on must-not-search tasks: 0
- Retrieval misses after search: 0

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
