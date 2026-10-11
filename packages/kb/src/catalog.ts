import type { IndexedDocument } from "./search";

export type CatalogChange = {
  seq: number;
  path: string;
  op: string;
  source: string;
  message: string | null;
  createdAt: string;
};

export function renderIndex(documents: IndexedDocument[], area?: string) {
  const lines = area
    ? [`# ${area}`, ""]
    : ["# Knowledge base", "", "Generated catalog. MEMORY.md stays the short entry point.", ""];
  const grouped = new Map<string, string[]>();
  for (const loaded of documents) {
    const doc = loaded.document;
    if (doc.path === "index.md" || doc.path === "log.md") continue;
    const docArea = doc.kind === "fix" ? doc.area : doc.path.split("/")[0] || "notes";
    if (area && docArea !== area) continue;
    const summary = doc.kind === "fix" ? doc.problem.split("\n")[0] : doc.title;
    const bucket = grouped.get(docArea) ?? [];
    bucket.push(`- [[${doc.path.replace(/\.md$/, "")}]] ${summary} (${loaded.layer})`);
    grouped.set(docArea, bucket);
  }
  if (!grouped.size) lines.push("No documents yet.");
  for (const [name, entries] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    if (!area) lines.push(`## ${name}`, "");
    lines.push(...entries, "");
  }
  return lines.join("\n").trim();
}

export function renderLog(changes: CatalogChange[]) {
  const lines = ["# Log", "", "Generated from the change log. Do not hand-edit.", ""];
  if (!changes.length) lines.push("No changes yet.");
  for (const change of [...changes].sort((left, right) => right.seq - left.seq)) {
    const message = change.message ? ` ${change.message}` : "";
    lines.push(
      `- ${change.createdAt} ${change.op} [[${change.path.replace(/\.md$/, "")}]] (${change.source})${message}`,
    );
  }
  return lines.join("\n").trim();
}
