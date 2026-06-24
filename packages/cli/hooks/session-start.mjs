#!/usr/bin/env node
/**
 * ClankerOverflow SessionStart hook.
 *
 * Prints a concise reminder that ClankerOverflow is active, so the agent
 * knows to search before debugging. This replaces the old static `type: "prompt"`
 * entry with a `type: "command"` hook that all harnesses (Claude, Codex,
 * ZCode) can execute.
 *
 * The nudge is intentionally short — it primes the agent at session start,
 * while the PostToolUse hook handles ambient detection during the session.
 */

console.log(
  [
    "ClankerOverflow is active as your engineering memory.",
    "Search BEFORE implementing or debugging any non-trivial, framework-specific code",
    "(integrations, SSR/SEO, auth flows, config gotchas) or any error/stack trace.",
    "Use `search_solutions` with the smallest distinctive fingerprint first.",
    "The search cost is near-zero; the cost of rediscovering a known gotcha is high.",
  ].join(" "),
);
