import type { IndexedDocument } from "./search";
import type { FixDocument } from "./types";

export type LintCode =
  | "duplicate-title"
  | "duplicate-signature"
  | "near-duplicate-area"
  | "stale"
  | "broken-link"
  | "missing-frontmatter"
  | "deep-area";

export type LintIssue = {
  code: LintCode;
  path: string;
  message: string;
};

const STALE_DAYS = 180;
const GENERATED = new Set(["MEMORY.md", "AGENTS.md", "index.md", "log.md"]);

function normalizeArea(area: string) {
  return area.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function ageDays(isoDate: string, now: Date) {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) return 0;
  return (now.getTime() - parsed) / 86_400_000;
}

function linksIn(text: string) {
  return [...text.matchAll(/\[\[([^\]#|]+)\]\]/g)].map((match) => match[1]?.trim() ?? "");
}

export function lintDocuments(documents: IndexedDocument[], now = new Date()): LintIssue[] {
  const issues: LintIssue[] = [];
  const known = new Set(documents.map((item) => item.document.path.replace(/\.md$/, "")));
  const titles = new Map<string, string>();
  const signatures = new Map<string, string>();
  const areas = new Map<string, Set<string>>();

  for (const item of documents) {
    const doc = item.document;
    const depth = doc.path.split("/").length - 1;
    if (depth > 2) {
      issues.push({
        code: "deep-area",
        path: doc.path,
        message: "Areas are at most two folders deep.",
      });
    }

    const body = doc.kind === "note" ? doc.body : `${doc.problem}\n${doc.solution}`;
    if (doc.kind === "note" && !GENERATED.has(doc.path) && /^## Problem\b/m.test(doc.body)) {
      issues.push({
        code: "missing-frontmatter",
        path: doc.path,
        message: "This page looks like a fix but has no YAML frontmatter.",
      });
    }

    for (const link of linksIn(body)) {
      if (link.startsWith("transcripts/")) continue;
      if (!known.has(link.replace(/\.md$/, ""))) {
        issues.push({
          code: "broken-link",
          path: doc.path,
          message: `Missing linked page [[${link}]].`,
        });
      }
    }

    if (doc.kind !== "fix") continue;
    const area = doc.area || doc.path.split("/")[0] || "general";
    const normalized = normalizeArea(area);
    const names = areas.get(normalized) ?? new Set<string>();
    names.add(area);
    areas.set(normalized, names);

    const titleKey = doc.title.trim().toLowerCase();
    const previousTitle = titles.get(titleKey);
    if (previousTitle) {
      issues.push({
        code: "duplicate-title",
        path: doc.path,
        message: `Title matches ${previousTitle}.`,
      });
    } else {
      titles.set(titleKey, doc.path);
    }

    for (const signature of doc.errorSignatures) {
      if (signature.length < 4) continue;
      const key = signature.toLowerCase();
      const previous = signatures.get(key);
      if (previous && previous !== doc.path) {
        issues.push({
          code: "duplicate-signature",
          path: doc.path,
          message: `${signature} is also on ${previous}.`,
        });
      } else {
        signatures.set(key, doc.path);
      }
    }

    if (doc.status === "verified" && ageDays(doc.lastVerified || doc.updated, now) > STALE_DAYS) {
      issues.push({
        code: "stale",
        path: doc.path,
        message: `Last verified more than ${STALE_DAYS} days ago.`,
      });
    }
  }

  for (const names of areas.values()) {
    if (names.size < 2) continue;
    const listed = [...names].sort().join(" and ");
    for (const item of documents) {
      if (item.document.kind !== "fix") continue;
      if (!names.has(item.document.area)) continue;
      issues.push({
        code: "near-duplicate-area",
        path: item.document.path,
        message: `Folder names ${listed} look like the same area. Lint does not block the write.`,
      });
    }
  }

  return issues;
}

export function lintFix(doc: FixDocument, now = new Date()) {
  return lintDocuments([{ layer: "team", document: doc }], now);
}
