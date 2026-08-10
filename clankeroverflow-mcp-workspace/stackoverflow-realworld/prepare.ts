import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type {
  ContentAttribution,
  DatasetManifest,
  StackOverflowQuery,
  StackOverflowSolution,
} from "./types.js";

const REQUIRED_COLUMNS = [
  "CanonicalQuestionId",
  "CanonicalTitle",
  "CanonicalBody",
  "CanonicalTags",
  "CanonicalScore",
  "CanonicalCreationDate",
  "AcceptedAnswerId",
  "AcceptedAnswerBody",
  "AcceptedAnswerScore",
  "DuplicateQuestionId",
  "DuplicateTitle",
  "DuplicateBody",
  "DuplicateTags",
  "DuplicateCreationDate",
] as const;

const PROVENANCE_COLUMNS = [
  "CanonicalContentLicense",
  "CanonicalAuthorUserId",
  "CanonicalAuthorDisplayName",
  "AcceptedAnswerContentLicense",
  "AcceptedAnswerAuthorUserId",
  "AcceptedAnswerAuthorDisplayName",
  "DuplicateContentLicense",
  "DuplicateAuthorUserId",
  "DuplicateAuthorDisplayName",
] as const;

const SPLIT_SEED = "stackoverflow-realworld-v1";

export function parseCsv(input: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = (rows.shift() ?? []).map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "") : header,
  );
  if (!headers.length) throw new Error("CSV has no header row");
  return rows
    .filter((values) => values.some(Boolean))
    .map((values, rowIndex) => {
      if (values.length !== headers.length) {
        throw new Error(
          `CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}`,
        );
      }
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntity(entity: string) {
  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
  }
  if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
  return HTML_ENTITIES[entity] ?? `&${entity};`;
}

export function normalizeHtml(html: string) {
  return html
    .replace(/<(?:br|\/p|\/pre|\/li|\/blockquote|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([#a-zA-Z0-9]+);/g, (_, entity: string) => decodeEntity(entity))
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tagsFrom(value: string) {
  const bracketed = [...value.matchAll(/<([^>]+)>/g)].map((match) => match[1]!.toLowerCase());
  return [...new Set(bracketed.length ? bracketed : value.split(/[\s,]+/).filter(Boolean))];
}

function numeric(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} is not numeric: ${value}`);
  return parsed;
}

function solutionId(canonicalQuestionId: string) {
  return `so:q:${canonicalQuestionId}`;
}

function optionalText(value: string | undefined) {
  return value?.trim() || null;
}

function attribution(
  row: Record<string, string>,
  fields: {
    contentLicense: string;
    authorUserId: string;
    authorDisplayName: string;
  },
  postUrl: string,
): ContentAttribution {
  return {
    postUrl,
    contentLicense: optionalText(row[fields.contentLicense]),
    authorUserId: optionalText(row[fields.authorUserId]),
    authorDisplayName: optionalText(row[fields.authorDisplayName]),
  };
}

export function summarizeProvenance(
  rows: Array<Record<string, string>>,
  headers: readonly string[],
) {
  const headerSet = new Set(headers);
  const columnsPresent = PROVENANCE_COLUMNS.filter((column) => headerSet.has(column));
  const columnsMissing = PROVENANCE_COLUMNS.filter((column) => !headerSet.has(column));
  const relationshipsWithCompleteProvenance = rows.filter((row) =>
    PROVENANCE_COLUMNS.every((column) => Boolean(row[column]?.trim())),
  ).length;
  return {
    columnsPresent,
    columnsMissing,
    relationshipsWithCompleteProvenance,
    relationshipsMissingProvenance: rows.length - relationshipsWithCompleteProvenance,
    redistributionReady:
      rows.length > 0 &&
      columnsMissing.length === 0 &&
      relationshipsWithCompleteProvenance === rows.length,
  };
}

function dateBucket(date: string) {
  const year = Number.parseInt(date.slice(0, 4), 10);
  if (!Number.isFinite(year)) return "unknown";
  if (year < 2015) return "before-2015";
  if (year < 2020) return "2015-2019";
  return "2020-plus";
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function assignSplits(queries: StackOverflowQuery[]) {
  const strata = new Map<string, StackOverflowQuery[]>();
  for (const query of queries) {
    const key = `${query.primaryTag}:${query.dateBucket}`;
    const stratum = strata.get(key) ?? [];
    stratum.push(query);
    strata.set(key, stratum);
  }
  for (const stratum of strata.values()) {
    stratum.sort((left, right) =>
      hash(`${SPLIT_SEED}:${left.id}`).localeCompare(hash(`${SPLIT_SEED}:${right.id}`)),
    );
    const developmentCount = Math.min(
      stratum.length - 1,
      stratum.length >= 5 ? Math.max(1, Math.round(stratum.length * 0.2)) : 0,
    );
    stratum.forEach((query, index) => {
      query.split = index < developmentCount ? "development" : "test";
    });
  }
}

export function buildDataset(rows: Array<Record<string, string>>) {
  const headers = new Set(Object.keys(rows[0] ?? {}));
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.has(column));
  if (missing.length) throw new Error(`Missing required CSV columns: ${missing.join(", ")}`);

  const solutions = new Map<string, StackOverflowSolution>();
  const queries = new Map<string, StackOverflowQuery>();
  for (const row of rows) {
    const canonicalQuestionId = row.CanonicalQuestionId!.trim();
    const duplicateQuestionId = row.DuplicateQuestionId!.trim();
    const id = solutionId(canonicalQuestionId);
    const solution: StackOverflowSolution = {
      id,
      canonicalQuestionId,
      acceptedAnswerId: row.AcceptedAnswerId!.trim(),
      title: row.CanonicalTitle!.trim(),
      questionText: normalizeHtml(row.CanonicalBody!),
      answerText: normalizeHtml(row.AcceptedAnswerBody!),
      questionBodyHtml: row.CanonicalBody!,
      answerBodyHtml: row.AcceptedAnswerBody!,
      questionAttribution: attribution(
        row,
        {
          contentLicense: "CanonicalContentLicense",
          authorUserId: "CanonicalAuthorUserId",
          authorDisplayName: "CanonicalAuthorDisplayName",
        },
        `https://stackoverflow.com/questions/${canonicalQuestionId}`,
      ),
      answerAttribution: attribution(
        row,
        {
          contentLicense: "AcceptedAnswerContentLicense",
          authorUserId: "AcceptedAnswerAuthorUserId",
          authorDisplayName: "AcceptedAnswerAuthorDisplayName",
        },
        `https://stackoverflow.com/a/${row.AcceptedAnswerId!.trim()}`,
      ),
      tags: tagsFrom(row.CanonicalTags!),
      questionScore: numeric(row.CanonicalScore!, "CanonicalScore"),
      answerScore: numeric(row.AcceptedAnswerScore!, "AcceptedAnswerScore"),
      creationDate: row.CanonicalCreationDate!.trim(),
    };
    const existingSolution = solutions.get(id);
    if (existingSolution && existingSolution.acceptedAnswerId !== solution.acceptedAnswerId) {
      throw new Error(
        `Canonical question ${canonicalQuestionId} has inconsistent accepted answers`,
      );
    }
    solutions.set(id, existingSolution ?? solution);

    const queryId = `so:q:${duplicateQuestionId}`;
    const duplicateTags = tagsFrom(row.DuplicateTags!);
    const query = queries.get(queryId) ?? {
      id: queryId,
      duplicateQuestionId,
      title: row.DuplicateTitle!.trim(),
      text: normalizeHtml(`${row.DuplicateTitle!}\n\n${row.DuplicateBody!}`),
      bodyHtml: row.DuplicateBody!,
      attribution: attribution(
        row,
        {
          contentLicense: "DuplicateContentLicense",
          authorUserId: "DuplicateAuthorUserId",
          authorDisplayName: "DuplicateAuthorDisplayName",
        },
        `https://stackoverflow.com/questions/${duplicateQuestionId}`,
      ),
      tags: duplicateTags,
      primaryTag: duplicateTags[0] ?? solution.tags[0] ?? "untagged",
      dateBucket: dateBucket(row.DuplicateCreationDate!),
      creationDate: row.DuplicateCreationDate!.trim(),
      relevantSolutionIds: [],
      split: "test" as const,
    };
    if (!query.relevantSolutionIds.includes(id)) query.relevantSolutionIds.push(id);
    queries.set(queryId, query);
  }
  const queryList = [...queries.values()].sort((left, right) => left.id.localeCompare(right.id));
  assignSplits(queryList);
  return {
    solutions: [...solutions.values()].sort((left, right) => left.id.localeCompare(right.id)),
    queries: queryList,
    headers: [...headers],
  };
}

function jsonLines(values: readonly unknown[]) {
  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

export function prepareDataset(inputPath: string, outputDirectory: string) {
  const absoluteInput = resolve(inputPath);
  const raw = readFileSync(absoluteInput);
  const rows = parseCsv(raw.toString("utf8"));
  const dataset = buildDataset(rows);
  const manifest: DatasetManifest = {
    version: 2,
    source: {
      filename: basename(absoluteInput),
      sha256: createHash("sha256").update(raw).digest("hex"),
      bytes: raw.byteLength,
      extractedVia: "Stack Exchange Data Explorer",
      sampling:
        "Newest canonical IDs first after configured tag and score filters; recency-biased.",
    },
    generatedAt: new Date().toISOString(),
    counts: {
      relationships: rows.length,
      solutions: dataset.solutions.length,
      queries: dataset.queries.length,
      multiGoldQueries: dataset.queries.filter((query) => query.relevantSolutionIds.length > 1)
        .length,
      developmentQueries: dataset.queries.filter((query) => query.split === "development").length,
      testQueries: dataset.queries.filter((query) => query.split === "test").length,
    },
    split: {
      method: "20/80 deterministic split stratified by primary tag and coarse creation-date bucket",
      seed: SPLIT_SEED,
    },
    licenses: summarizeProvenance(rows, dataset.headers),
  };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "solutions.jsonl"), jsonLines(dataset.solutions));
  writeFileSync(resolve(outputDirectory, "queries.jsonl"), jsonLines(dataset.queries));
  writeFileSync(
    resolve(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

function option(args: string[], name: string, fallback: string) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : resolve(args[index + 1] ?? "");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const root = resolve(dirname(new URL(import.meta.url).pathname));
  const input = option(
    process.argv.slice(2),
    "--input",
    resolve(homedir(), "Downloads/stackoverflow-clankeroverflow-1500.csv"),
  );
  const output = option(process.argv.slice(2), "--output", resolve(root, "data"));
  const manifest = prepareDataset(input, output);
  console.log(JSON.stringify(manifest, null, 2));
}
