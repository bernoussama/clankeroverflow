import { describe, expect, test } from "vitest";

import { runMarkdownRetrievalEval } from "./run";

describe("markdown retrieval eval", () => {
  test("recall at 5 is no worse than SQLite FTS keyword search", () => {
    const report = runMarkdownRetrievalEval();
    expect(report.queries).toBe(100);
    expect(report.markdown.recall5).toBeGreaterThan(0.8);
    expect(report.recall5Delta).toBeGreaterThanOrEqual(-0.005);
    expect(report.passed).toBe(true);
  });
});
