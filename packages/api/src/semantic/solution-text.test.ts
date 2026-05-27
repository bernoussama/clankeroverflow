import { describe, expect, test } from "vitest";
import { solutionEmbeddingText } from "./solution-text";

describe("solutionEmbeddingText", () => {
  test("includes tags header when present", () => {
    const t = solutionEmbeddingText({
      problem: "Fix bug",
      solution: "Use x",
      tags: "rust,cli",
    });
    expect(t).toContain("Tags: rust,cli");
    expect(t).toContain("Problem:");
    expect(t).toContain("Fix bug");
    expect(t).toContain("Solution:");
    expect(t).toContain("Use x");
  });

  test("omits tags line when empty", () => {
    const t = solutionEmbeddingText({
      problem: "P",
      solution: "S",
      tags: null,
    });
    expect(t.startsWith("Problem:")).toBe(true);
  });
});
