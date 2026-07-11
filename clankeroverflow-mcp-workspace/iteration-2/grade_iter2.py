#!/usr/bin/env python3
"""Grade iteration-2 runs — verify precision improved without hurting recall."""
import json
from pathlib import Path

BASE = Path(__file__).parent

# Expected behavior
EXPECTED = {
    "inertia-noindex-ssr": True,      # should-trigger (recall check)
    "ts2307-pnpm-workspaces": True,    # should-trigger (recall check)
    "dark-mode-toggle": False,         # should-not-trigger (precision check)
    "swr-vs-reactquery": False,        # should-not-trigger (precision check)
    "event-loop-explain": False,       # should-not-trigger (precision check)
}

# Metrics will be filled from inline reports as runs complete
RUNS = {
    # Populated after runs complete
}


def main():
    # Try to read metrics from disk first, fall back to inline data
    results = []
    for eval_name, should_trigger in EXPECTED.items():
        metrics_path = BASE / eval_name / "with_skill" / "outputs" / "metrics.json"
        if metrics_path.exists():
            metrics = json.loads(metrics_path.read_text())
        else:
            print(f"WARNING: No metrics found for {eval_name} — run may still be in progress or couldn't write files")
            results.append({"eval": eval_name, "should_trigger": should_trigger, "searched": None, "passed": None})
            continue

        searched = metrics.get("searched_clankeroverflow", False)
        passed = searched if should_trigger else not searched
        results.append({
            "eval": eval_name,
            "should_trigger": should_trigger,
            "searched": searched,
            "search_query": metrics.get("search_query"),
            "passed": passed,
        })

    # Print results
    print("\n" + "=" * 80)
    print("ITERATION-2 RESULTS (with refined skill)")
    print("=" * 80)
    print(f"{'Eval':<30} {'Should trigger?':<16} {'Searched?':<12} {'Result':<8}")
    print("-" * 80)

    valid = [r for r in results if r["passed"] is not None]
    recall_runs = [r for r in valid if r["should_trigger"]]
    precision_runs = [r for r in valid if not r["should_trigger"]]

    for r in results:
        trig = "YES" if r["should_trigger"] else "NO"
        if r["searched"] is None:
            print(f"{r['eval']:<30} {trig:<16} {'PENDING':<12} {'—':<8}")
        else:
            srch = str(r["searched"])
            res = "✓ PASS" if r["passed"] else "✗ FAIL"
            print(f"{r['eval']:<30} {trig:<16} {srch:<12} {res:<8}")

    print("\n" + "-" * 80)
    if recall_runs:
        recall_pass = sum(1 for r in recall_runs if r["passed"])
        print(f"Recall (should-trigger):   {recall_pass}/{len(recall_runs)} passed")
    if precision_runs:
        prec_pass = sum(1 for r in precision_runs if r["passed"])
        print(f"Precision (should-NOT):    {prec_pass}/{len(precision_runs)} passed")

    print("\n" + "=" * 80)
    print("COMPARISON: iteration-1 vs iteration-2")
    print("=" * 80)
    print(f"{'Metric':<40} {'Iter-1':<12} {'Iter-2':<12}")
    print("-" * 64)
    iter1_recall = "4/4 (100%)"
    iter1_prec = "3/5 (60%)"
    iter2_recall = f"{sum(1 for r in recall_runs if r['passed'])}/{len(recall_runs)} ({sum(1 for r in recall_runs if r['passed'])/len(recall_runs)*100:.0f}%)" if recall_runs else "—"
    iter2_prec = f"{sum(1 for r in precision_runs if r['passed'])}/{len(precision_runs)} ({sum(1 for r in precision_runs if r['passed'])/len(precision_runs)*100:.0f}%)" if precision_runs else "—"
    print(f"{'Should-trigger recall':<40} {iter1_recall:<12} {iter2_recall:<12}")
    print(f"{'Should-not-trigger precision':<40} {iter1_prec:<12} {iter2_prec:<12}")


if __name__ == "__main__":
    main()
