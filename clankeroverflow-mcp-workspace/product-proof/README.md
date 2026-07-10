# ClankerOverflow MCP Reuse Benchmark

This workspace contains the buyer-facing MCP reuse benchmark harness.

The committed `runs/sample-runs.json` file is validation data only. It proves the
reporting and grading pipeline works, but it must not be used as published
product proof.

## Files

- `scenarios.json`: 30 MCP-agent prompts with trigger policy, difficulty,
  learned-reuse, and cost-claim metadata.
- `fixtures.json`: sanitized reusable fixes loaded into the local fixture
  corpus for retrieval checks.
- `runs/*.json`: recorded known-fix, empty-DB, no-MCP, and learned-reuse run files.
- `reports/report.md`: generated public-style report.
- `reports/summary.json`: generated machine-readable grading output.

## Run

Generate the sample validation report:

```sh
pnpm eval:mcp-product-proof --runs clankeroverflow-mcp-workspace/product-proof/runs/sample-runs.json
```

Generate a report from real run files only:

```sh
pnpm eval:mcp-product-proof --exclude-sample
```

Generate from a specific run file or run directory:

```sh
pnpm eval:mcp-product-proof --runs path/to/runs.json
pnpm eval:mcp-product-proof --runs path/to/run-directory
```

Run the optional hosted smoke test. This is excluded from headline metrics:

```sh
CLANKER_API_KEY=... pnpm eval:mcp-product-proof --hosted-smoke
```

Include estimated dollar costs with an explicit pricing file:

```sh
pnpm eval:mcp-product-proof --pricing-config pricing.json
```

## Run File Shape

Each run file stores MCP-agent answers across reuse configs plus optional human
pairwise review:

```json
{
  "metadata": {
    "agent": "codex",
    "model": "model-name",
    "sample": false
  },
  "runs": [
    {
      "scenario_id": "ts2307-pnpm-workspaces",
      "config": "with_mcp_known_fix",
      "repetition": 1,
      "status": "completed",
      "usage": {
        "input_tokens": 1000,
        "cached_input_tokens": 300,
        "output_tokens": 280,
        "reasoning_output_tokens": 20,
        "total_provider_tokens": 1300,
        "elapsed_ms": 11000
      },
      "cost_estimate": null,
      "tool_calls": [
        {
          "name": "search_solutions",
          "arguments": { "query": "TS2307 pnpm" },
          "result_ids": ["fix-ts2307-pnpm-workspace-dep"]
        }
      ],
      "search_query": "TS2307 pnpm",
      "returned_solution_ids": ["fix-ts2307-pnpm-workspace-dep"],
      "logged_solution_ids": [],
      "final_answer": "...",
      "human_review": {
        "correctness": 5,
        "usefulness": 5,
        "specificity": 5,
        "safety": 5,
        "rationale": "..."
      }
    }
  ],
  "pairwise_reviews": [
    {
      "scenario_id": "ts2307-pnpm-workspaces",
      "repetition": 1,
      "winner": "with_mcp_win",
      "rationale": "The MCP answer identifies the decisive prior fix."
    }
  ]
}
```

Use `winner: "tie"` when both answers are roughly equivalent and
`winner: "without_mcp_win"` when the baseline answer is materially better.

Supported configs are `with_mcp_known_fix`, `with_mcp_empty_db`, `without_mcp`,
`learn_then_reuse_pass1`, and `learn_then_reuse_pass2`.
