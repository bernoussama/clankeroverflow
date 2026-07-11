#!/usr/bin/env python3
"""Persist metrics from inline subagent reports, grade assertions, aggregate benchmark."""
import json
import os
from pathlib import Path

BASE = Path(__file__).parent

# ── Metrics extracted from subagent inline reports ──
# Each entry: (searched_clankeroverflow, search_query, mentioned_skill_or_clankeroverflow, proposed_solution_summary)
# For baseline runs that grepped the repo (not ClankerOverflow), searched=false.
RUNS = {
    # Should-trigger cases
    "inertia-noindex-ssr": {
        "should_trigger": True,
        "with_skill": {
            "searched_clankeroverflow": True,
            "search_query": "inertia head noindex server-side rendered",
            "mentioned_skill": True,
            "proposed_solution_summary": "With SSR off, Inertia <Head> is JS-only and never reaches initial HTML; render noindex server-side in Blade layout or re-enable SSR.",
        },
        "without_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "With SSR off, render robots meta server-side in Blade layout or enable Inertia SSR.",
        },
    },
    "stripe-cf-workers-webcrypto": {
        "should_trigger": True,
        "with_skill": {
            "searched_clankeroverflow": True,
            "search_query": "stripe webhook cloudflare workers",
            "mentioned_skill": True,
            "proposed_solution_summary": "Use stripe.webhooks.constructEventAsync (Web Crypto) over raw body instead of sync constructEvent which needs Node crypto.createVerify.",
        },
        "without_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "Re-implement HMAC-SHA256 check with Web Crypto, verifying against raw request body.",
        },
    },
    "prisma-neon-timeout": {
        "should_trigger": True,
        "with_skill": None,  # FAILED - turn execution failed
        "without_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "Use directUrl for db pull/migrations, keep pooled URL for runtime client.",
        },
    },
    "eaddrinuse-ci": {
        "should_trigger": True,
        "with_skill": {
            "searched_clankeroverflow": True,
            "search_query": "EADDRINUSE",
            "mentioned_skill": True,
            "proposed_solution_summary": "TIME_WAIT socket race; use ephemeral PORT=0 or ensure SO_REUSEADDR + graceful shutdown.",
        },
        "without_skill": {
            "searched_clankeroverflow": False,  # grepped repo, not ClankerOverflow
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "Backgrounded dev server leaking across steps; use ephemeral PORT=0 or kill process group.",
        },
    },
    "ts2307-pnpm-workspaces": {
        "should_trigger": True,
        "with_skill": {
            "searched_clankeroverflow": True,
            "search_query": "TS2307 pnpm",
            "mentioned_skill": True,
            "proposed_solution_summary": "Declare sibling as workspace:* dependency and run pnpm install; paths alone insufficient for node16/nodenext/bundler resolution.",
        },
        "without_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "Set moduleResolution: bundler, point exports at real files, add workspace:* dep.",
        },
    },
    # Should-not-trigger cases
    "dark-mode-toggle": {
        "should_trigger": False,
        "with_skill": {
            "searched_clankeroverflow": True,  # FALSE POSITIVE
            "search_query": "dark mode toggle localStorage",
            "mentioned_skill": True,
            "proposed_solution_summary": "Navbar toggle with inline head bootstrap to prevent FOUC, persisted to localStorage.",
        },
        "without_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "Already implemented in codebase via ThemeProvider and ModeToggle; no new code needed.",
        },
    },
    "promise-async-await": {
        "should_trigger": False,
        "with_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_skill": True,
            "proposed_solution_summary": "Converted .then chain to sequential async/await preserving identical Promise-returning behavior.",
        },
        "without_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "Converted fetchUser Promise chain to async/await with sequential awaits.",
        },
    },
    "swr-vs-reactquery": {
        "should_trigger": False,
        "with_skill": {
            "searched_clankeroverflow": True,  # FALSE POSITIVE
            "search_query": "SWR React Query",
            "mentioned_skill": True,
            "proposed_solution_summary": "Default to React Query for non-trivial apps; choose SWR for minimalism.",
        },
        "without_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "Recommend React Query for mutations/devtools; SWR for simple read-heavy apps.",
        },
    },
    "event-loop-explain": {
        "should_trigger": False,
        "with_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_skill": True,
            "proposed_solution_summary": "Explained event-loop phases and nextTick > Promise > setImmediate > setTimeout ordering.",
        },
        "without_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "Explained event-loop phases and nextTick > Promise > setImmediate ordering with examples.",
        },
    },
    "billing-discount": {
        "should_trigger": False,
        "with_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_skill": True,
            "proposed_solution_summary": "Enterprise discount branch in calculateTotal: 15% off when subtotal exceeds $10k.",
        },
        "without_skill": {
            "searched_clankeroverflow": False,
            "search_query": None,
            "mentioned_clankeroverflow": False,
            "proposed_solution_summary": "Enterprise discount: 15% off when subtotal exceeds $10k, with named constants.",
        },
    },
}


def grade_assertion(should_trigger: bool, searched: bool, config: str) -> bool:
    """Grade the core assertion: did the agent search when it should (or not)?"""
    if should_trigger:
        return searched  # Should have searched
    else:
        return not searched  # Should NOT have searched


def main():
    """Grade recorded runs and write per-run plus aggregate benchmark artifacts."""
    grading_results = []
    benchmark_runs = []

    for eval_name, data in RUNS.items():
        should_trigger = data["should_trigger"]
        eval_id = list(RUNS.keys()).index(eval_name) + 1

        for config in ["with_skill", "without_skill"]:
            run_data = data.get(config)
            if run_data is None:
                # Failed run
                grading_results.append({
                    "eval": eval_name,
                    "config": config,
                    "status": "FAILED",
                    "searched": None,
                    "passed": None,
                })
                continue

            searched = run_data["searched_clankeroverflow"]
            passed = grade_assertion(should_trigger, searched, config)

            # Write metrics.json if missing
            metrics_path = BASE / eval_name / config / "outputs" / "metrics.json"
            if not metrics_path.exists():
                metrics_path.parent.mkdir(parents=True, exist_ok=True)
                metrics_path.write_text(json.dumps(run_data, indent=2))

            # Build grading entry
            assertion_text = (
                f"Agent {'searches' if should_trigger else 'does NOT search'} ClankerOverflow "
                f"(should_trigger={should_trigger})"
            )
            grading_results.append({
                "eval": eval_name,
                "eval_id": eval_id,
                "config": config,
                "should_trigger": should_trigger,
                "searched": searched,
                "passed": passed,
                "search_query": run_data.get("search_query"),
            })

            benchmark_runs.append({
                "eval_id": eval_id,
                "eval_name": eval_name,
                "configuration": config,
                "run_number": 1,
                "result": {
                    "passed": 1 if passed else 0,
                    "total": 1,
                    "pass_rate": 1.0 if passed else 0.0,
                },
            })

    # ── Print grading table ──
    print("\n" + "=" * 90)
    print("GRADING RESULTS — iteration-1")
    print("=" * 90)
    print(f"{'Eval':<30} {'Trigger?':<10} {'Config':<14} {'Searched':<10} {'Passed':<8}")
    print("-" * 90)
    for r in grading_results:
        if r.get("status") == "FAILED":
            print(f"{r['eval']:<30} {'—':<10} {r['config']:<14} {'FAILED':<10} {'—':<8}")
        else:
            trig = "YES" if r["should_trigger"] else "NO"
            srch = str(r["searched"])
            psd = "✓ PASS" if r["passed"] else "✗ FAIL"
            print(f"{r['eval']:<30} {trig:<10} {r['config']:<14} {srch:<10} {psd:<8}")

    # ── Aggregate stats ──
    with_skill_st = [r for r in grading_results if r.get("config") == "with_skill" and r.get("should_trigger")]
    with_skill_snt = [r for r in grading_results if r.get("config") == "with_skill" and not r.get("should_trigger")]
    baseline_st = [r for r in grading_results if r.get("config") == "without_skill" and r.get("should_trigger")]
    baseline_snt = [r for r in grading_results if r.get("config") == "without_skill" and not r.get("should_trigger")]

    def pass_rate(runs):
        """Return the fraction of valid grading results that passed."""
        valid = [r for r in runs if r.get("passed") is not None]
        if not valid:
            return 0.0
        return sum(1 for r in valid if r["passed"]) / len(valid)

    print("\n" + "=" * 90)
    print("AGGREGATE")
    print("=" * 90)
    print(f"{'Metric':<50} {'Rate':<10}")
    print("-" * 60)
    print(f"{'with_skill: should-trigger recall':<50} {pass_rate(with_skill_st):.0%} ({sum(1 for r in with_skill_st if r.get('passed'))}/{len([r for r in with_skill_st if r.get('passed') is not None])})")
    print(f"{'with_skill: should-not-trigger precision':<50} {pass_rate(with_skill_snt):.0%} ({sum(1 for r in with_skill_snt if r.get('passed'))}/{len([r for r in with_skill_snt if r.get('passed') is not None])})")
    print(f"{'baseline: should-trigger (no skill)':<50} {pass_rate(baseline_st):.0%}")
    print(f"{'baseline: should-not-trigger (no skill)':<50} {pass_rate(baseline_snt):.0%}")

    # ── Write benchmark.json ──
    def stats(runs):
        """Summarize pass rates for a collection of benchmark runs."""
        rates = [r["result"]["pass_rate"] for r in runs]
        if not rates:
            return {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0}
        mean = sum(rates) / len(rates)
        variance = sum((r - mean) ** 2 for r in rates) / len(rates) if rates else 0
        return {"mean": round(mean, 2), "stddev": round(variance ** 0.5, 2),
                "min": round(min(rates), 2), "max": round(max(rates), 2)}

    ws_runs = [r for r in benchmark_runs if r["configuration"] == "with_skill"]
    wo_runs = [r for r in benchmark_runs if r["configuration"] == "without_skill"]

    benchmark = {
        "metadata": {
            "skill_name": "clankeroverflow-mcp",
            "timestamp": "2026-06-23",
            "evals_run": list(range(1, 11)),
            "runs_per_configuration": 1,
        },
        "runs": benchmark_runs,
        "run_summary": {
            "with_skill": {"pass_rate": stats(ws_runs)},
            "without_skill": {"pass_rate": stats(wo_runs)},
            "delta": {"pass_rate": f"{stats(ws_runs)['mean'] - stats(wo_runs)['mean']:+.2f}"},
        },
        "notes": [
            "Should-trigger recall: skill caused search on 4/4 successful runs (1 failed). Baseline searched on 0/5.",
            "Should-not-trigger precision: 2 false positives (dark-mode, swr-vs-reactquery). The skill over-triggered on borderline cases.",
            "dark-mode: skill found a genuinely relevant FOUC gotcha, blurring the trivial/non-trivial boundary.",
            "swr-vs-reactquery: agent searched but acknowledged it shouldn't have — preference question, not a gotcha.",
            "The new description successfully fixed the core undertriggering problem (implementation patterns now trigger).",
            "Tradeoff: higher recall, slightly lower precision. Overtriggering cost is low (~2s search); undertriggering cost is high (~1h rediscovery).",
        ],
    }

    bench_path = BASE / "benchmark.json"
    bench_path.write_text(json.dumps(benchmark, indent=2))
    print(f"\nBenchmark written to {bench_path}")

    # Write grading.json for each run
    for r in grading_results:
        if r.get("passed") is None:
            continue
        eval_dir = BASE / r["eval"] / r["config"]
        grading_path = eval_dir / "grading.json"
        assertion_text = (
            f"Agent {'searches' if r['should_trigger'] else 'does NOT search'} ClankerOverflow"
        )
        grading = {
            "expectations": [{
                "text": assertion_text,
                "passed": r["passed"],
                "evidence": f"searched_clankeroverflow={r['searched']}, should_trigger={r['should_trigger']}",
            }],
            "summary": {
                "passed": 1 if r["passed"] else 0,
                "failed": 0 if r["passed"] else 1,
                "total": 1,
                "pass_rate": 1.0 if r["passed"] else 0.0,
            },
        }
        grading_path.write_text(json.dumps(grading, indent=2))


if __name__ == "__main__":
    main()
