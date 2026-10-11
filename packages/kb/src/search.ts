import MiniSearch from "minisearch";

import { documentHeadings, documentText } from "./document";
import type { DocStatus, KbDocument, KbLayer, SearchFilters, SearchHit } from "./types";

export type IndexedDocument = {
  layer: KbLayer;
  document: KbDocument;
};

type IndexRecord = {
  key: string;
  docId: string;
  path: string;
  layer: KbLayer;
  title: string;
  aliases: string;
  error_signatures: string;
  tags: string;
  headings: string;
  body: string;
  status: DocStatus | "";
  kind: KbDocument["kind"];
  area: string;
  type: string;
  tagList: string[];
  signatures: string[];
};

const BOOST = {
  title: 4,
  aliases: 3,
  error_signatures: 3,
  tags: 3,
  headings: 2,
  body: 1,
};

function layerRank(layer: KbLayer) {
  switch (layer) {
    case "repo":
      return 0;
    case "team":
      return 1;
    case "personal":
      return 2;
    default: {
      const unreachable: never = layer;
      return unreachable;
    }
  }
}

function statusRank(status: DocStatus | null) {
  switch (status) {
    case "verified":
      return 0;
    case "draft":
      return 1;
    case null:
      return 1;
    case "stale":
      return 2;
    case "superseded":
      return 3;
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

function toRecord(loaded: IndexedDocument): IndexRecord {
  const doc = loaded.document;
  if (doc.kind === "note") {
    return {
      key: `${loaded.layer}:${doc.path}`,
      docId: doc.id,
      path: doc.path,
      layer: loaded.layer,
      title: doc.title,
      aliases: "",
      error_signatures: "",
      tags: "",
      headings: documentHeadings(doc),
      body: documentText(doc),
      status: "",
      kind: "note",
      area: doc.path.split("/")[0] || "",
      type: "",
      tagList: [],
      signatures: [],
    };
  }
  return {
    key: `${loaded.layer}:${doc.path}`,
    docId: doc.id,
    path: doc.path,
    layer: loaded.layer,
    title: doc.title,
    aliases: doc.aliases.join(" "),
    error_signatures: doc.errorSignatures.join(" "),
    tags: doc.tags.join(" "),
    headings: documentHeadings(doc),
    body: [doc.problem, doc.rootCause, doc.solution, doc.verification, doc.notes]
      .filter(Boolean)
      .join("\n"),
    status: doc.status,
    kind: "fix",
    area: doc.area,
    type: doc.type,
    tagList: doc.tags.map((tag) => tag.toLowerCase()),
    signatures: doc.errorSignatures,
  };
}

function snippet(text: string, query: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const needle = query
    .trim()
    .split(/\s+/)
    .find((term) => term.length > 2)
    ?.toLowerCase();
  const index = needle ? compact.toLowerCase().indexOf(needle) : 0;
  const start = Math.max(0, (index === -1 ? 0 : index) - 40);
  const slice = compact.slice(start, start + 180);
  return `${start > 0 ? "…" : ""}${slice}${start + 180 < compact.length ? "…" : ""}`;
}

function passesFilters(record: IndexRecord, filters: SearchFilters) {
  if (!filters.includeSuperseded && record.status === "superseded") return false;
  if (filters.status && record.status !== filters.status) return false;
  if (filters.area && record.area !== filters.area) return false;
  if (filters.type && record.type !== filters.type) return false;
  if (filters.tags?.length) {
    const wanted = new Set(filters.tags.map((tag) => tag.toLowerCase()));
    if (!record.tagList.some((tag) => wanted.has(tag))) return false;
  }
  return true;
}

export function searchDocuments(
  documents: IndexedDocument[],
  query: string,
  options: { limit?: number; filters?: SearchFilters } = {},
): SearchHit[] {
  const limit = options.limit ?? 10;
  const filters = options.filters ?? {};
  const records = documents.map(toRecord).filter((record) => passesFilters(record, filters));
  if (!records.length || !query.trim()) return [];

  const index = new MiniSearch<IndexRecord>({
    idField: "key",
    fields: ["title", "aliases", "error_signatures", "tags", "headings", "body"],
    storeFields: ["docId", "path", "layer", "title", "status", "kind", "signatures", "body"],
  });
  index.addAll(records);

  const lexical = index.search(query, {
    boost: BOOST,
    prefix: true,
    combineWith: "OR",
  });
  const fuzzy = index.search(query, {
    fields: ["title", "aliases", "tags"],
    boost: { title: BOOST.title, aliases: BOOST.aliases, tags: BOOST.tags },
    prefix: true,
    fuzzy: 0.2,
    combineWith: "OR",
  });

  const scores = new Map<string, number>();
  for (const hit of [...lexical, ...fuzzy]) {
    scores.set(hit.id, Math.max(scores.get(hit.id) ?? 0, hit.score));
  }

  const queryText = query.toLowerCase();
  const hits: SearchHit[] = [];
  for (const record of records) {
    let score = scores.get(record.key) ?? 0;
    const signatureMatch = record.signatures.some(
      (signature) => signature.length >= 3 && queryText.includes(signature.toLowerCase()),
    );
    if (signatureMatch) score += 100;
    if (score <= 0) continue;
    if (record.status === "verified") score *= 1.05;
    if (record.status === "stale") score *= 0.8;
    hits.push({
      id: record.docId,
      path: record.path,
      layer: record.layer,
      title: record.title,
      status: record.status || null,
      score,
      snippet: snippet(record.body, query),
      kind: record.kind,
    });
  }

  hits.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  const top = hits[0]?.score ?? 0;
  const ranked = hits
    .map((hit, index) => ({ hit, index }))
    .sort((left, right) => {
      const leftClose = top > 0 && left.hit.score >= top * 0.85;
      const rightClose = top > 0 && right.hit.score >= top * 0.85;
      if (leftClose && rightClose) {
        const layer = layerRank(left.hit.layer) - layerRank(right.hit.layer);
        if (layer !== 0) return layer;
        const status = statusRank(left.hit.status) - statusRank(right.hit.status);
        if (status !== 0) return status;
      }
      return right.hit.score - left.hit.score || left.index - right.index;
    })
    .map((entry) => entry.hit);

  return ranked.slice(0, limit);
}
