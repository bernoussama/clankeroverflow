import type { DocStatus, FixDocument, FixType, KbDocument, NoteDocument, NoteEntry } from "./types";

const FIX_TYPES = new Set<FixType>(["fix", "howto", "decision", "gotcha", "reference"]);
const STATUSES = new Set<DocStatus>(["draft", "verified", "stale", "superseded"]);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyToNull(value: string) {
  if (!value || value === "null") return null;
  return value;
}

function unescapeFrontmatter(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join("\n");
    return trimmed;
  } catch {
    return trimmed.replace(/^["']|["']$/g, "");
  }
}

function parseList(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    // Fall through to comma-separated values.
  }
  return trimmed
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function rawField(frontmatter: string, name: string) {
  const match = frontmatter.match(new RegExp(`^${name}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function field(frontmatter: string, name: string) {
  return unescapeFrontmatter(rawField(frontmatter, name));
}

function section(markdown: string, title: string) {
  const match = markdown.match(new RegExp(`(?:^|\\n)## ${title}\\n([\\s\\S]*?)(?=\\n## (?!#)|$)`));
  return restoreHeadings(match?.[1]?.trim() ?? "");
}

function shieldHeadings(value: string) {
  return value.replace(/(^|\n)## /g, "$1#### ");
}

function restoreHeadings(value: string) {
  return value.replace(/(^|\n)#### /g, "$1## ");
}

function asFixType(value: string): FixType {
  return FIX_TYPES.has(value as FixType) ? (value as FixType) : "fix";
}

function asStatus(value: string): DocStatus {
  return STATUSES.has(value as DocStatus) ? (value as DocStatus) : "draft";
}

function parseNoteEntries(body: string): NoteEntry[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const raw = line.slice(2).trim();
      const match = raw.match(/^(.*)\s+\[([^\]]+)\]$/);
      const text = (match?.[1] ?? raw).trim();
      const metadata: Record<string, string> = {};
      for (const part of (match?.[2] ?? "").split(";")) {
        const separator = part.indexOf(":");
        if (separator === -1) continue;
        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (key) metadata[key] = value;
      }
      return { text, metadata };
    });
}

export function parseDocument(path: string, markdown: string): KbDocument {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!frontmatterMatch) {
    const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || path;
    return {
      kind: "note",
      id: path,
      path,
      title,
      entries: parseNoteEntries(markdown),
      body: markdown.trim(),
    };
  }

  const frontmatter = frontmatterMatch[1] ?? "";
  const body = (frontmatterMatch[2] ?? "").trim();
  const title = field(frontmatter, "title") || section(body, "Problem") || path;
  const tags = parseList(rawField(frontmatter, "tags"));
  const hasFixShape =
    field(frontmatter, "type") !== "" ||
    section(body, "Problem") !== "" ||
    section(body, "Fix") !== "" ||
    section(body, "Verified Fix") !== "";

  if (!hasFixShape) {
    return {
      kind: "note",
      id: field(frontmatter, "id") || path,
      path,
      title,
      entries: parseNoteEntries(body),
      body,
    };
  }

  return {
    kind: "fix",
    id: field(frontmatter, "id") || path,
    path,
    title,
    type: asFixType(field(frontmatter, "type")),
    area: field(frontmatter, "area") || path.split("/")[0] || "general",
    tags,
    aliases: parseList(rawField(frontmatter, "aliases")),
    errorSignatures: parseList(rawField(frontmatter, "error_signatures")),
    status: asStatus(field(frontmatter, "status")),
    confirmations: Number(field(frontmatter, "confirmations") || "0") || 0,
    created: field(frontmatter, "created") || today(),
    updated: field(frontmatter, "updated") || today(),
    authors: parseList(rawField(frontmatter, "authors")),
    lastVerified: emptyToNull(field(frontmatter, "last_verified")),
    supersededBy: emptyToNull(field(frontmatter, "superseded_by")),
    related: parseList(rawField(frontmatter, "related")),
    problem: section(body, "Problem"),
    rootCause: section(body, "Root Cause"),
    solution: section(body, "Fix") || section(body, "Verified Fix"),
    verification: section(body, "Verification"),
    notes: section(body, "Notes"),
  };
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

function yamlList(values: string[]) {
  return JSON.stringify(values);
}

export function formatFixDocument(doc: FixDocument) {
  return [
    "---",
    `id: ${yamlString(doc.id)}`,
    `title: ${yamlString(doc.title)}`,
    `type: ${doc.type}`,
    `area: ${yamlString(doc.area)}`,
    `tags: ${yamlList(doc.tags)}`,
    `aliases: ${yamlList(doc.aliases)}`,
    `error_signatures: ${yamlList(doc.errorSignatures)}`,
    `status: ${doc.status}`,
    `confirmations: ${doc.confirmations}`,
    `authors: ${yamlList(doc.authors ?? [])}`,
    `last_verified: ${doc.lastVerified ?? "null"}`,
    `superseded_by: ${doc.supersededBy ? yamlString(doc.supersededBy) : "null"}`,
    `related: ${yamlList(doc.related ?? [])}`,
    `created: ${doc.created}`,
    `updated: ${doc.updated}`,
    "---",
    "",
    "## Problem",
    shieldHeadings(doc.problem),
    "",
    "## Root Cause",
    shieldHeadings(doc.rootCause),
    "",
    "## Fix",
    shieldHeadings(doc.solution),
    "",
    "## Verification",
    shieldHeadings(doc.verification),
    "",
    ...(doc.notes ? ["## Notes", doc.notes, ""] : []),
  ].join("\n");
}

export function formatNoteEntry(entry: NoteEntry) {
  const metadata = Object.entries(entry.metadata)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
  return metadata ? `- ${entry.text} [${metadata}]` : `- ${entry.text}`;
}

export function formatNoteDocument(doc: NoteDocument) {
  const heading = doc.body.startsWith("#") ? doc.body : `# ${doc.title}\n\n${doc.body}`.trim();
  return `${heading}\n`;
}

export function documentText(doc: KbDocument) {
  if (doc.kind === "note") return doc.body;
  return [doc.problem, doc.rootCause, doc.solution, doc.verification, doc.notes]
    .filter(Boolean)
    .join("\n");
}

export function documentHeadings(doc: KbDocument) {
  const source = doc.kind === "note" ? doc.body : formatFixDocument(doc);
  return source
    .split("\n")
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, ""))
    .join(" ");
}
