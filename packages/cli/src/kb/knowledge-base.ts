import { homedir } from "node:os";
import { join } from "node:path";

import { mkdirSync, writeFileSync } from "node:fs";

import { lintDocuments, renderLog, starterFiles } from "@clankeroverflow/kb";
import { findRepoRoot } from "../learn";
import { searchDocuments } from "./search";
import { MarkdownStore } from "./store";
import type { FixDocument, KbLayer, NoteEntry, SearchFilters, SearchHit } from "./types";

export const REPO_KB_DIR = ".clankeroverflow/kb";

export function personalKbRoot(home = homedir()) {
  return join(home, ".local", "share", "clankeroverflow", "kb");
}

export function repoKbRoot(start = process.cwd()) {
  const root = findRepoRoot(start);
  return root ? join(root, REPO_KB_DIR) : null;
}

export function openKnowledgeBases(
  options: { cwd?: string; home?: string; teamRoot?: string } = {},
) {
  const stores: MarkdownStore[] = [new MarkdownStore(personalKbRoot(options.home), "personal")];
  const repo = repoKbRoot(options.cwd);
  if (repo) stores.push(new MarkdownStore(repo, "repo"));
  if (options.teamRoot) stores.push(new MarkdownStore(options.teamRoot, "team"));
  return stores;
}

export class KnowledgeBase {
  constructor(private readonly stores: MarkdownStore[]) {}

  static open(options?: { cwd?: string; home?: string; teamRoot?: string }) {
    return new KnowledgeBase(openKnowledgeBases(options));
  }

  storeFor(layer: KbLayer) {
    const store = this.stores.find((candidate) => candidate.layer === layer);
    if (!store) throw new Error(`No ${layer} knowledge base is configured.`);
    return store;
  }

  search(query: string, options: { limit?: number; filters?: SearchFilters } = {}): SearchHit[] {
    return searchDocuments(
      this.stores.flatMap((store) => store.list()),
      query,
      options,
    );
  }

  read(path: string, layer?: KbLayer) {
    const stores = layer ? [this.storeFor(layer)] : this.stores;
    for (const store of stores) {
      const loaded = store.read(path);
      if (loaded) return loaded;
    }
    return undefined;
  }

  browse(area?: string) {
    const docs = this.stores.flatMap((store) => store.list());
    const lines = area
      ? [`# ${area}`, ""]
      : ["# Knowledge base", "", "Generated catalog. MEMORY.md stays the short entry point.", ""];
    const grouped = new Map<string, string[]>();
    for (const loaded of docs) {
      const doc = loaded.document;
      const docArea = doc.kind === "fix" ? doc.area : doc.path.split("/")[0] || "notes";
      if (area && docArea !== area) continue;
      const summary = doc.kind === "fix" ? doc.problem.split("\n")[0] : doc.title;
      const bucket = grouped.get(docArea) ?? [];
      bucket.push(`- [[${doc.path.replace(/\.md$/, "")}]] ${summary} (${loaded.layer})`);
      grouped.set(docArea, bucket);
    }
    if (!grouped.size) lines.push("No documents yet.");
    for (const [name, entries] of [...grouped].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!area) lines.push(`## ${name}`, "");
      lines.push(...entries, "");
    }
    return lines.join("\n").trim();
  }

  writeFix(
    layer: KbLayer,
    input: Parameters<MarkdownStore["writeFix"]>[0],
    options: { dedupe?: boolean } = {},
  ) {
    const store = this.storeFor(layer);
    return store.writeFix(input, {
      dedupeAgainst:
        options.dedupe === false
          ? []
          : this.stores.flatMap((item) => item.list().map((loaded) => loaded.document)),
    });
  }

  writeText(layer: KbLayer, path: string, body: string) {
    this.storeFor(layer).writeText(path, body);
  }

  append(layer: KbLayer, path: string, entry: NoteEntry) {
    return this.storeFor(layer).append(path, entry);
  }

  confirm(layer: KbLayer, path: string, worked: boolean, actor?: string) {
    return this.storeFor(layer).confirm(path, worked, actor);
  }

  files() {
    return this.stores.flatMap((store) => store.list());
  }

  count() {
    return this.stores.reduce((total, store) => total + store.list().length, 0);
  }

  lint() {
    return lintDocuments(this.stores.flatMap((store) => store.list()));
  }

  log() {
    return renderLog(
      this.stores.flatMap((store) =>
        store.changes().map((change) => ({ ...change, source: "cli" })),
      ),
    );
  }

  init() {
    for (const store of this.stores) {
      for (const file of starterFiles()) {
        if (store.read(file.path)) continue;
        mkdirSync(store.root, { recursive: true });
        writeFileSync(join(store.root, file.path), file.body);
      }
    }
  }
}

export function fixFromHit(document: FixDocument) {
  return {
    id: document.id,
    problem: document.problem || document.title,
    solution: document.solution,
    tags: document.tags.join(","),
    score: document.confirmations,
  };
}
