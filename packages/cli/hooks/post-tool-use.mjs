#!/usr/bin/env node
/**
 * ClankerOverflow PostToolUse / UserPromptSubmit hook.
 *
 * Reads the hook event JSON from stdin, inspects it for failure signals
 * (non-zero exit codes, stack traces, error codes, test/build failures),
 * and prints a short nudge to stdout when a signal is found. The nudge text
 * is injected into the agent's context by the harness.
 *
 * Silent on success: prints nothing when no failure signal is detected,
 * so there is zero context pollution during normal work.
 *
 * Debounced: prints the nudge at most once per fingerprint within a cooldown
 * window (default 5 minutes) to avoid nagging during iterative debugging.
 *
 * Harness payload formats:
 *   Claude / Codex / ZCode PostToolUse:
 *     { tool_name, tool_input, tool_response: { stdout, stderr, exit_code, ... } }
 *   Claude / Codex / ZCode UserPromptSubmit:
 *     { prompt: "the user's message" }
 *   Cursor postToolUse:
 *     { toolName, toolInput, toolOutput: { stdout, stderr, exitCode } }
 *
 * The script tolerates any shape — it searches the entire JSON blob for
 * recognizable failure signals regardless of nesting depth.
 */

import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Configuration ────────────────────────────────────────────────────────────

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between identical nudges

// Error codes that are distinctive enough to fingerprint a search.
const ERROR_CODE_PATTERNS = [
  /\b(EADDRINUSE|EACCES|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOENT|EEXIST|EPIPE)\b/g,
  /\b(TS\d{4,5})\b/g, // TypeScript: TS2307, TS2322, etc.
  /\b(P\d{3,4})\b/g, // Prisma: P2002, P2021, etc.
  /\b(ERR_[A-Z_]{3,})\b/g, // Node: ERR_MODULE_NOT_FOUND, ERR_INVALID_...
  /\b(SQLITE_\w+)\b/g, // SQLite errors
  /\b(NG\d{4,5})\b/g, // Angular
  /\b(GHC\d{5})\b/g, // Haskell GHC
  /\b(ORA-\d{5})\b/g, // Oracle
];

// Stack trace / failure indicator patterns (case-insensitive substring search).
const FAILURE_INDICATORS = [
  "stack trace",
  "at ",
  "traceback (most recent call last)", // Python
  "error: ", // generic
  "error:", // generic
  "fatal:",
  "panic:", // Go
  "undefined is not",
  "cannot find module",
  "module not found",
  "is not defined",
  "is not a function",
  "is not iterable",
  "cannot read propert",
  "cannot read from",
  "uncaught",
  "unhandled",
  "command not found",
  "no such file or directory",
  "permission denied",
  "failed to compile",
  "failed to build",
  "build failed",
  "compilation failed",
  "test failed",
  "tests? failed",
  "failing",
  "✗",
  "failed:",
  "exception",
  "segfault",
  "npm err!",
  "pnpm err",
  "error ts",
  "could not resolve",
  "cannot resolve",
];

// ── Debounce state ───────────────────────────────────────────────────────────

function debounceDir() {
  // Use OS-appropriate cache location, fall back to tmpdir.
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "clankeroverflow");
}

function shouldDebounce(fingerprint) {
  const dir = debounceDir();
  const file = join(dir, "hook-debounce.json");
  try {
    const raw = readFileSync(file, "utf8");
    const state = JSON.parse(raw);
    const entry = state[fingerprint];
    if (entry && Date.now() - entry < COOLDOWN_MS) return true;
  } catch {
    // No state file or invalid JSON — don't debounce.
  }
  return false;
}

function recordDebounce(fingerprint) {
  const dir = debounceDir();
  const file = join(dir, "hook-debounce.json");
  let state = {};
  try {
    const raw = readFileSync(file, "utf8");
    state = JSON.parse(raw);
  } catch {
    // Start fresh.
  }
  // Prune entries older than COOLDOWN_MS to keep the file small.
  const now = Date.now();
  for (const [key, ts] of Object.entries(state)) {
    if (now - ts > COOLDOWN_MS) delete state[key];
  }
  state[fingerprint] = now;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(state), "utf8");
  } catch {
    // Best-effort: if we can't write the debounce file, the hook still
    // functions (just without debouncing). Don't crash.
  }
}

// ── Signal detection ─────────────────────────────────────────────────────────

/**
 * Extract a fingerprint from the failure text — the smallest distinctive
 * token to suggest as a search query.
 */
function extractFingerprint(text) {
  for (const pattern of ERROR_CODE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[0]) return match[0];
  }
  return null;
}

/**
 * Detect whether the event payload contains a failure signal.
 * Returns { failed: boolean, fingerprint: string|null }.
 */
function detectFailure(text) {
  if (!text || text.length < 5) return { failed: false, fingerprint: null };

  // Normalize for matching.
  const lower = text.toLowerCase();

  // Check for explicit exit code / status indicators first (highest signal).
  const exitMatch = text.match(/(?:exit[_ ]?code|exitCode|status|code)\s*[:=]\s*(\d+)/i);
  if (exitMatch && parseInt(exitMatch[1], 10) !== 0) {
    return { failed: true, fingerprint: extractFingerprint(text) };
  }

  // Check for failure indicator substrings.
  for (const indicator of FAILURE_INDICATORS) {
    if (lower.includes(indicator.toLowerCase())) {
      return { failed: true, fingerprint: extractFingerprint(text) };
    }
  }

  // Check for error codes (even without surrounding "error" text).
  for (const pattern of ERROR_CODE_PATTERNS) {
    if (pattern.test(text)) {
      return { failed: true, fingerprint: extractFingerprint(text) };
    }
  }

  return { failed: false, fingerprint: null };
}

/**
 * Recursively extract all string values from a JSON object, concatenated.
 * This lets us search the entire payload regardless of nesting.
 */
function flattenStrings(obj, depth = 0) {
  if (depth > 10 || obj === null || obj === undefined) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return obj.map((v) => flattenStrings(v, depth + 1)).join("\n");
  if (typeof obj === "object")
    return Object.values(obj)
      .map((v) => flattenStrings(v, depth + 1))
      .join("\n");
  return "";
}

// ── Nudge message ────────────────────────────────────────────────────────────

function buildNudge(fingerprint) {
  const queryHint = fingerprint
    ? `e.g. "${fingerprint}"`
    : "the error code, package name, or short error phrase";
  return [
    "",
    "─".repeat(64),
    "ClankerOverflow: A failure signal was detected.",
    "",
    `Before re-debugging, search for prior fixes with: search_solutions(${queryHint})`,
    "A reusable verified fix may already exist. The search cost is ~2 seconds;",
    "rediscovering a known gotcha costs far more.",
    "─".repeat(64),
  ].join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Read the hook event payload from stdin (sync — hooks must be fast).
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    // No stdin available — nothing to inspect.
    return;
  }

  if (!raw.trim()) return;

  // Parse the JSON payload (tolerate non-JSON gracefully).
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // If it's not JSON, treat the raw text itself as the signal source
    // (some harnesses pass plain text for UserPromptSubmit).
    payload = raw;
  }

  // Flatten the entire payload into searchable text.
  const text = typeof payload === "string" ? payload : flattenStrings(payload);

  // Detect failure.
  const { failed, fingerprint } = detectFailure(text);
  if (!failed) return;

  // Debounce: don't nudge repeatedly for the same signal.
  const debounceKey =
    fingerprint || createHash("md5").update(text.slice(0, 500)).digest("hex").slice(0, 12);
  if (shouldDebounce(debounceKey)) return;

  // Record this nudge for future debounce checks.
  recordDebounce(debounceKey);

  // Print the nudge to stdout — the harness injects this into the agent context.
  console.log(buildNudge(fingerprint));
}

try {
  main();
} catch {
  // Never crash the hook — a crash would be visible to the user as a hook
  // error and could disrupt their workflow. Fail silently.
}
