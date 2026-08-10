import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { searchWithAutoFallback } from "./mcp/auto-search";
import type { SolutionBackend } from "./mcp/backend";
import { modeForSource, resolveConfig, type BackendSource, type ServerConfig } from "./mcp/config";
import { createSolutionBackend } from "./mcp/create-backend";
import { openLocalDb } from "./mcp/local-db";

export const DEFAULT_REPO_SOLUTIONS_DIR = ".clankeroverflow/solutions";

export type LearnInput = {
  problem: string;
  rootCause: string;
  solution: string;
  verification: string;
  tags: string;
  fingerprints?: string;
  framework?: string;
  packageManager?: string;
  runtime?: string;
  repoNote?: string;
};

export type LearnOptions = {
  config?: ServerConfig;
  source?: BackendSource;
  repoRoot?: string | null;
  mirror?: boolean;
  dedupe?: boolean;
  upvoteExisting?: boolean;
};

export type LearnResult = {
  id: string;
  source: "local" | "remote";
  status: "logged" | "duplicate";
  repoNotePath?: string;
  warnings: string[];
  duplicateIds: string[];
};

type LocalSolutionRow = {
  id: string;
  problem: string;
  solution: string;
  tags: string | null;
  created_at: string;
  updated_at: string;
};

function requireText(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function splitList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeTags(input: LearnInput) {
  return uniqueList([
    ...splitList(input.tags),
    ...splitList(input.framework),
    ...splitList(input.packageManager),
    ...splitList(input.runtime),
  ])
    .map((tag) => tag.toLowerCase().replaceAll(/\s+/g, "-"))
    .join(",");
}

function redactText(value: string, warnings: string[]) {
  const replacements: Array<[RegExp, string, string]> = [
    [/\b([A-Z][A-Z0-9_]{2,})=(?:"[^"]*"|'[^']*'|[^\s"'`]+)/g, "$1=<redacted>", "env var value"],
    [
      /\b(?:sk|pk|rk|clk|ghp|github_pat|xoxb|xoxp)_[A-Za-z0-9_-]{12,}\b/g,
      "<redacted-secret>",
      "secret-looking token",
    ],
    [
      /https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|[^\s/]+\.internal)(?:[^\s)]*)/g,
      "<private-url>",
      "private URL",
    ],
    [/(?:\/Users|\/home)\/[A-Za-z0-9._-]+\/[^\s)'"`]+/g, "<local-path>", "local filesystem path"],
    [/[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\[^\s)'"`]+/g, "<local-path>", "local filesystem path"],
  ];

  let text = value;
  for (const [pattern, replacement, label] of replacements) {
    if (pattern.test(text)) {
      warnings.push(`Redacted ${label}.`);
      text = text.replace(pattern, replacement);
    }
  }
  return text;
}

function sanitizeInput(input: LearnInput) {
  const warnings: string[] = [];
  const sanitized = {
    problem: redactText(requireText(input.problem, "problem"), warnings),
    rootCause: redactText(requireText(input.rootCause, "root_cause"), warnings),
    solution: redactText(requireText(input.solution, "solution"), warnings),
    verification: redactText(requireText(input.verification, "verification"), warnings),
    tags: requireText(input.tags, "tags"),
    fingerprints: redactText(input.fingerprints?.trim() ?? "", warnings),
    framework: redactText(input.framework?.trim() ?? "", warnings),
    packageManager: redactText(input.packageManager?.trim() ?? "", warnings),
    runtime: redactText(input.runtime?.trim() ?? "", warnings),
    repoNote: redactText(input.repoNote?.trim() ?? "", warnings),
  };

  const projectSpecific = /\bour\b|\bclient\b|\bcustomer\b|<local-path>|<private-url>/i.test(
    [
      sanitized.problem,
      sanitized.rootCause,
      sanitized.solution,
      sanitized.verification,
      sanitized.repoNote,
    ].join("\n"),
  );
  if (projectSpecific) {
    warnings.push("Review for project-specific details before sharing remotely.");
  }

  return { input: sanitized, warnings: uniqueList(warnings) };
}

function section(title: string, value: string) {
  return `## ${title}\n${value.trim() || "n/a"}`;
}

export function formatLearnedSolution(input: LearnInput) {
  const context = [
    input.framework ? `- Framework: ${input.framework}` : "",
    input.runtime ? `- Runtime: ${input.runtime}` : "",
    input.packageManager ? `- Package manager: ${input.packageManager}` : "",
    input.fingerprints ? `- Fingerprints: ${input.fingerprints}` : "",
    input.repoNote ? `- Repo note: ${input.repoNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    section("Root Cause", input.rootCause),
    section("Verified Fix", input.solution),
    section("Verification", input.verification),
    context ? section("Reusable Context", context) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "learned-solution"
  );
}

export function findRepoRoot(start = process.cwd()): string | null {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function escapeFrontmatter(value: string) {
  return JSON.stringify(value);
}

export function formatLearnMarkdown(id: string, input: LearnInput) {
  return [
    "---",
    `id: ${escapeFrontmatter(id)}`,
    `tags: ${escapeFrontmatter(input.tags)}`,
    input.fingerprints ? `fingerprints: ${escapeFrontmatter(input.fingerprints)}` : "",
    input.framework ? `framework: ${escapeFrontmatter(input.framework)}` : "",
    input.packageManager ? `package_manager: ${escapeFrontmatter(input.packageManager)}` : "",
    input.runtime ? `runtime: ${escapeFrontmatter(input.runtime)}` : "",
    "---",
    "",
    "# Problem",
    input.problem,
    "",
    section("Root Cause", input.rootCause),
    "",
    section("Verified Fix", input.solution),
    "",
    section("Verification", input.verification),
    "",
    input.repoNote ? section("Repo Note", input.repoNote) : "",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function writeLearnMarkdown(repoRoot: string, id: string, input: LearnInput) {
  const dir = join(repoRoot, DEFAULT_REPO_SOLUTIONS_DIR);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${slugify(input.problem)}-${id.slice(0, 8)}.md`);
  writeFileSync(path, formatLearnMarkdown(id, input), "utf8");
  return path;
}

function fieldFromFrontmatter(frontmatter: string, name: string) {
  const match = frontmatter.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
  if (!match) return "";
  const value = match[1]!.trim();
  try {
    return JSON.parse(value) as string;
  } catch {
    return value.replace(/^["']|["']$/g, "");
  }
}

function markdownSection(markdown: string, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(
    new RegExp(`(?:^|\\n)#{1,2}\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n#{1,2}\\s+|$)`, "i"),
  );
  return match?.[1]?.trim() ?? "";
}

export function parseLearnMarkdown(markdown: string): LearnInput {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return {
    problem: markdownSection(markdown, "Problem"),
    rootCause: markdownSection(markdown, "Root Cause"),
    solution: markdownSection(markdown, "Verified Fix"),
    verification: markdownSection(markdown, "Verification"),
    tags: fieldFromFrontmatter(frontmatter, "tags"),
    fingerprints: fieldFromFrontmatter(frontmatter, "fingerprints"),
    framework: fieldFromFrontmatter(frontmatter, "framework"),
    packageManager: fieldFromFrontmatter(frontmatter, "package_manager"),
    runtime: fieldFromFrontmatter(frontmatter, "runtime"),
    repoNote: markdownSection(markdown, "Repo Note"),
  };
}

function duplicateQuery(input: LearnInput) {
  return splitList(input.fingerprints)[0] ?? input.problem;
}

function resultLooksMatching(
  result: { problem: string; solution: string; tags: string | null },
  input: LearnInput,
) {
  const haystack = `${result.problem}\n${result.solution}\n${result.tags ?? ""}`.toLowerCase();
  const fingerprints = splitList(input.fingerprints).map((fingerprint) =>
    fingerprint.toLowerCase(),
  );
  if (fingerprints.some((fingerprint) => haystack.includes(fingerprint))) return true;
  const problemTerms = input.problem
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4);
  if (!problemTerms.length) return false;
  const matched = problemTerms.filter((term) => haystack.includes(term)).length;
  return matched / problemTerms.length >= 0.6;
}

async function findDuplicate(backend: Pick<SolutionBackend, "search">, input: LearnInput) {
  const query = duplicateQuery(input);
  const result = await searchWithAutoFallback(backend, {
    query,
    limit: 3,
    mode: "auto",
  });
  return result.results.find((candidate) => resultLooksMatching(candidate, input));
}

export async function learnSolution(
  input: LearnInput,
  options: LearnOptions = {},
): Promise<LearnResult> {
  const config = options.config ?? resolveConfig();
  const source = modeForSource(config, options.source ?? "local");
  const backend = createSolutionBackend(config, source);
  try {
    const { input: sanitized, warnings } = sanitizeInput({
      ...input,
      tags: normalizeTags(input),
    });

    if (options.dedupe !== false) {
      const duplicate = await findDuplicate(backend, sanitized);
      if (duplicate) {
        if (options.upvoteExisting !== false) {
          await backend.vote({ id: duplicate.id, isUpvote: true }).catch(() => undefined);
        }
        return {
          id: duplicate.id,
          source,
          status: "duplicate",
          warnings,
          duplicateIds: [duplicate.id],
        };
      }
    }

    const result = await backend.log({
      problem: sanitized.problem,
      solution: formatLearnedSolution(sanitized),
      tags: sanitized.tags,
    });

    const repoRoot = options.repoRoot === undefined ? findRepoRoot() : options.repoRoot;
    const repoNotePath =
      options.mirror === false || !repoRoot
        ? undefined
        : writeLearnMarkdown(repoRoot, result.id, sanitized);

    return {
      id: result.id,
      source,
      status: "logged",
      repoNotePath,
      warnings: uniqueList([...warnings, result.warning ?? ""]),
      duplicateIds: [],
    };
  } finally {
    await backend.close();
  }
}

export function repoSolutionsDir(repoRoot = findRepoRoot()) {
  return repoRoot ? join(repoRoot, DEFAULT_REPO_SOLUTIONS_DIR) : null;
}

export function listRepoSolutionFiles(repoRoot = findRepoRoot()) {
  const dir = repoSolutionsDir(repoRoot);
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => join(dir, entry))
    .sort();
}

export async function syncRepoSolutions(options: LearnOptions = {}) {
  const files = listRepoSolutionFiles(options.repoRoot);
  const results: LearnResult[] = [];
  for (const file of files) {
    const input = parseLearnMarkdown(readFileSync(file, "utf8"));
    results.push(
      await learnSolution(input, {
        ...options,
        mirror: false,
        source: options.source ?? "local",
      }),
    );
  }
  return { files, results };
}

function parseStructuredSolution(solution: string) {
  const reusableContext = markdownSection(solution, "Reusable Context");
  const contextField = (label: string) =>
    reusableContext.match(new RegExp(`^\\s*-\\s*${label}:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";
  return {
    rootCause: markdownSection(solution, "Root Cause") || "See verified fix.",
    solution: markdownSection(solution, "Verified Fix") || solution,
    verification:
      markdownSection(solution, "Verification") || "Previously logged in ClankerOverflow.",
    framework: contextField("Framework"),
    runtime: contextField("Runtime"),
    packageManager: contextField("Package manager"),
    fingerprints: contextField("Fingerprints"),
    repoNote: contextField("Repo note"),
  };
}

export function exportLocalSolutions(
  options: { config?: ServerConfig; repoRoot?: string | null } = {},
) {
  const config = options.config ?? resolveConfig();
  const repoRoot = options.repoRoot === undefined ? findRepoRoot() : options.repoRoot;
  if (!repoRoot) throw new Error("No git repository root found for Markdown export.");
  const db = openLocalDb(config.localDbPath);
  try {
    const rows = db
      .prepare(
        `SELECT id, problem, solution, tags, created_at, updated_at
         FROM solution
         ORDER BY updated_at DESC`,
      )
      .all() as LocalSolutionRow[];
    const paths = rows.map((row) => {
      const parsed = parseStructuredSolution(row.solution);
      return writeLearnMarkdown(repoRoot, row.id, {
        problem: row.problem,
        rootCause: parsed.rootCause,
        solution: parsed.solution,
        verification: parsed.verification,
        repoNote: parsed.repoNote,
        framework: parsed.framework,
        runtime: parsed.runtime,
        packageManager: parsed.packageManager,
        fingerprints: parsed.fingerprints,
        tags: row.tags ?? "clankeroverflow",
      });
    });
    return { rows, paths };
  } finally {
    db.close();
  }
}

export function gitRepoRoot(start = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: start,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return findRepoRoot(start);
  }
}

export function solutionResourceIndex(repoRoot = findRepoRoot()) {
  const files = listRepoSolutionFiles(repoRoot);
  if (!files.length) return "No repo ClankerOverflow solutions found.";
  return files
    .map((file) => {
      const parsed = parseLearnMarkdown(readFileSync(file, "utf8"));
      return `- ${basename(file)}: ${parsed.problem}`;
    })
    .join("\n");
}

export function readSolutionResource(idOrSlug: string, repoRoot = findRepoRoot()) {
  const files = listRepoSolutionFiles(repoRoot);
  const file = files.find((candidate) => {
    if (basename(candidate, ".md") === idOrSlug) return true;
    const frontmatter = readFileSync(candidate, "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    return fieldFromFrontmatter(frontmatter, "id") === idOrSlug;
  });
  if (!file) throw new Error(`Repo solution not found: ${idOrSlug}`);
  return { file, text: readFileSync(file, "utf8") };
}
