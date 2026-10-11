import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { formatFixDocument, formatNoteEntry, parseDocument } from "./document";
import { scrubFields } from "./sanitize";
import type { FixDocument, KbDocument, KbLayer, NoteEntry } from "./types";

export type LoadedDocument = {
  layer: KbLayer;
  root: string;
  absolutePath: string;
  document: KbDocument;
};

function walkMarkdown(dir: string): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walkMarkdown(path);
      return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries;
}

function relativePath(root: string, file: string) {
  return relative(root, file).split("\\").join("/");
}

function writeAtomic(file: string, contents: string) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, contents, "utf8");
  renameSync(temporary, file);
}

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "note"
  );
}

export function extractErrorSignatures(text: string) {
  const matches = text.match(/\b(?:TS\d{3,5}|[A-Z][A-Z0-9_]{3,})\b/g) ?? [];
  return [...new Set(matches)];
}

export class MarkdownStore {
  constructor(
    readonly root: string,
    readonly layer: KbLayer,
  ) {}

  list(): LoadedDocument[] {
    return walkMarkdown(this.root)
      .filter((file) => !relativePath(this.root, file).startsWith("transcripts/"))
      .map((file) => ({
        layer: this.layer,
        root: this.root,
        absolutePath: file,
        document: parseDocument(relativePath(this.root, file), readFileSync(file, "utf8")),
      }));
  }

  read(path: string): LoadedDocument | undefined {
    const file = join(this.root, path);
    try {
      return {
        layer: this.layer,
        root: this.root,
        absolutePath: file,
        document: parseDocument(path, readFileSync(file, "utf8")),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  writeFix(
    input: {
      title: string;
      problem: string;
      solution: string;
      rootCause?: string;
      verification?: string;
      notes?: string;
      tags?: string[];
      aliases?: string[];
      errorSignatures?: string[];
      area?: string;
      type?: FixDocument["type"];
      status?: FixDocument["status"];
      id?: string;
      path?: string;
    },
    options: { dedupeAgainst?: KbDocument[] } = {},
  ) {
    const scrubbed = scrubFields({
      title: input.title,
      problem: input.problem,
      solution: input.solution,
      rootCause: input.rootCause ?? "",
      verification: input.verification ?? "",
      notes: input.notes ?? "",
    });
    const title = scrubbed.fields.title ?? input.title;
    const duplicate = (options.dedupeAgainst ?? []).find((doc) => isSameFix(doc, title, input));
    if (duplicate) {
      return {
        status: "possible_duplicate" as const,
        document: duplicate,
        warnings: scrubbed.warnings,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const area = slugify(input.area || input.tags?.[0] || "general");
    const id = input.id ?? randomUUID();
    const path = input.path ?? `${area}/${slugify(title)}-${id.slice(0, 8)}.md`;
    const existing = input.path ? this.read(input.path)?.document : undefined;
    const created = existing?.kind === "fix" ? existing.created : today;
    const confirmations = existing?.kind === "fix" ? existing.confirmations : 0;
    const document: FixDocument = {
      kind: "fix",
      id: existing?.kind === "fix" ? existing.id : id,
      path,
      title,
      type: input.type ?? "fix",
      area,
      tags: input.tags ?? [],
      aliases: input.aliases ?? [],
      errorSignatures: input.errorSignatures?.length
        ? input.errorSignatures
        : extractErrorSignatures(`${title}\n${scrubbed.fields.problem}`),
      status: input.status ?? (existing?.kind === "fix" ? existing.status : "draft"),
      confirmations,
      created,
      updated: today,
      problem: scrubbed.fields.problem ?? "",
      rootCause: scrubbed.fields.rootCause ?? "",
      solution: scrubbed.fields.solution ?? "",
      verification: scrubbed.fields.verification ?? "",
      notes: scrubbed.fields.notes ?? "",
    };
    writeAtomic(join(this.root, path), formatFixDocument(document));
    this.record(existing ? "update" : "create", path, title);
    return { status: "written" as const, document, warnings: scrubbed.warnings };
  }

  append(path: string, entry: NoteEntry) {
    const loaded = this.read(path);
    const line = formatNoteEntry(entry);
    if (!loaded) {
      const title = path.replace(/\.md$/, "").split("/").at(-1) || "Notes";
      writeAtomic(join(this.root, path), `# ${title}\n\n${line}\n`);
      return this.read(path)!;
    }
    if (loaded.document.kind === "fix") {
      throw new Error(`Cannot append a note line to fix document ${path}. Update the fix instead.`);
    }
    const body = readFileSync(loaded.absolutePath, "utf8").replace(/\s*$/, "");
    writeAtomic(loaded.absolutePath, `${body}\n${line}\n`);
    this.record("append", path, entry.text);
    return this.read(path)!;
  }

  confirm(path: string, worked: boolean, actor?: string) {
    const loaded = this.read(path);
    if (!loaded || loaded.document.kind !== "fix") {
      throw new Error(`No fix document at ${path}.`);
    }
    const document = { ...loaded.document };
    const self = Boolean(actor && (document.authors ?? []).includes(actor));
    if (worked && !self) {
      document.confirmations += 1;
      if (document.status === "draft") document.status = "verified";
      document.lastVerified = new Date().toISOString().slice(0, 10);
    } else if (!worked) {
      document.confirmations = Math.max(0, document.confirmations - 1);
      if (document.confirmations === 0) document.status = "stale";
    }
    document.updated = new Date().toISOString().slice(0, 10);
    writeAtomic(loaded.absolutePath, formatFixDocument(document));
    this.record("confirm", path, worked ? "worked" : "failed");
    return document;
  }

  writeText(path: string, body: string) {
    writeAtomic(join(this.root, path), body.endsWith("\n") ? body : `${body}\n`);
    this.record("create", path, path);
  }

  delete(path: string) {
    rmSync(join(this.root, path), { force: true });
    this.record("delete", path, "deleted");
  }

  changes() {
    const file = join(this.root, ".changes.jsonl");
    try {
      return readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map(
          (line) =>
            JSON.parse(line) as {
              seq: number;
              path: string;
              op: string;
              message: string;
              createdAt: string;
            },
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private record(op: string, path: string, message: string) {
    const seq = this.changes().length + 1;
    appendFileSync(
      join(this.root, ".changes.jsonl"),
      `${JSON.stringify({ seq, path, op, source: "cli", message, createdAt: new Date().toISOString() })}\n`,
    );
  }
}

function isSameFix(
  doc: KbDocument,
  title: string,
  input: { errorSignatures?: string[]; problem: string },
) {
  if (doc.kind !== "fix") return false;
  if (doc.title.trim().toLowerCase() === title.trim().toLowerCase()) return true;
  const haystack = `${title}\n${input.problem}`.toLowerCase();
  const signatures = [...doc.errorSignatures, ...(input.errorSignatures ?? [])].filter(
    (signature) => signature.length >= 4,
  );
  return signatures.some(
    (signature) =>
      doc.errorSignatures.some((existing) => existing.toLowerCase() === signature.toLowerCase()) &&
      haystack.includes(signature.toLowerCase()),
  );
}
