import { describe, expect, test } from "vitest";

import { runMarkdownRetrievalEval } from "./run";

describe("markdown retrieval eval", () => {
  test("recall at 5 stays at the measured markdown level", () => {
    const report = runMarkdownRetrievalEval();
    expect(report.queries).toBe(100);
    expect(report.markdown.recall5).toBeGreaterThanOrEqual(0.9);
    expect(report.passed).toBe(true);
  });
});
