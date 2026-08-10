import { describe, expect, test } from "vitest";

import { queryMetrics } from "./metrics.js";
import {
  assignSplits,
  buildDataset,
  normalizeHtml,
  parseCsv,
  summarizeProvenance,
} from "./prepare.js";
import type { StackOverflowQuery } from "./types.js";

const header = [
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
].join(",");

const provenanceColumns = [
  "CanonicalContentLicense",
  "CanonicalAuthorUserId",
  "CanonicalAuthorDisplayName",
  "AcceptedAnswerContentLicense",
  "AcceptedAnswerAuthorUserId",
  "AcceptedAnswerAuthorDisplayName",
  "DuplicateContentLicense",
  "DuplicateAuthorUserId",
  "DuplicateAuthorDisplayName",
];

function row(canonicalId: string, duplicateId: string) {
  return [
    canonicalId,
    '"Canonical, title"',
    '"<p>line one</p>\n<p>line ""two""</p>"',
    "<javascript>",
    "5",
    "2025-01-01",
    `a${canonicalId}`,
    '"<p>accepted</p>"',
    "7",
    duplicateId,
    "Duplicate title",
    '"<p>body</p>"',
    "<javascript>",
    "2025-02-01",
  ].join(",");
}

describe("Stack Overflow dataset preparation", () => {
  test("parses quoted multiline CSV and normalizes HTML", () => {
    const rows = parseCsv(`${header}\n${row("1", "9")}\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.CanonicalTitle).toBe("Canonical, title");
    expect(normalizeHtml(rows[0]!.CanonicalBody!)).toContain('line "two"');
  });

  test("groups repeated duplicate IDs as multi-gold", () => {
    const rows = parseCsv(`${header}\n${row("1", "9")}\n${row("2", "9")}\n`);
    const dataset = buildDataset(rows);
    expect(dataset.solutions).toHaveLength(2);
    expect(dataset.queries).toHaveLength(1);
    expect(dataset.queries[0]!.relevantSolutionIds).toEqual(["so:q:1", "so:q:2"]);
  });

  test("requires complete per-row provenance before allowing redistribution", () => {
    const completeValues = [
      "CC BY-SA 4.0",
      "101",
      "Canonical Author",
      "CC BY-SA 4.0",
      "102",
      "Answer Author",
      "CC BY-SA 4.0",
      "103",
      "Duplicate Author",
    ];
    const completeRows = parseCsv(
      `${header},${provenanceColumns.join(",")}\n${row("1", "9")},${completeValues.join(",")}\n`,
    );
    const complete = summarizeProvenance(completeRows, Object.keys(completeRows[0]!));
    expect(complete).toMatchObject({
      relationshipsWithCompleteProvenance: 1,
      relationshipsMissingProvenance: 0,
      redistributionReady: true,
    });
    const dataset = buildDataset(completeRows);
    expect(dataset.solutions[0]!.questionAttribution).toEqual({
      postUrl: "https://stackoverflow.com/questions/1",
      contentLicense: "CC BY-SA 4.0",
      authorUserId: "101",
      authorDisplayName: "Canonical Author",
    });
    expect(dataset.queries[0]!.attribution.authorDisplayName).toBe("Duplicate Author");

    const incompleteValues = [...completeValues];
    incompleteValues[5] = "";
    const incompleteRows = parseCsv(
      `${header},${provenanceColumns.join(",")}\n${row("1", "9")},${incompleteValues.join(",")}\n`,
    );
    expect(summarizeProvenance(incompleteRows, Object.keys(incompleteRows[0]!))).toMatchObject({
      columnsMissing: [],
      relationshipsWithCompleteProvenance: 0,
      relationshipsMissingProvenance: 1,
      redistributionReady: false,
    });
  });

  test("assigns deterministic splits and computes multi-gold metrics", () => {
    const queries = Array.from({ length: 20 }, (_, index) => ({
      id: `q${index}`,
      primaryTag: "javascript",
      dateBucket: "2020-plus",
      split: "test",
    })) as StackOverflowQuery[];
    assignSplits(queries);
    expect(queries.filter((query) => query.split === "development")).toHaveLength(4);
    const query = { relevantSolutionIds: ["a", "b"] } as StackOverflowQuery;
    expect(queryMetrics(query, ["x", "b"]).hit5).toBe(1);
    expect(queryMetrics(query, ["x", "b"]).recall5).toBe(0.5);
    expect(queryMetrics(query, ["x", "b"]).mrr10).toBe(0.5);
  });
});
