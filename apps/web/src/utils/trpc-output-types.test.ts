import { describe, expect, test } from "vitest";

import { searchResultSchema } from "./trpc-output-types";

describe("searchResultSchema", () => {
  test("accepts targeted solution responses without updatedAt", () => {
    const result = searchResultSchema.parse({
      id: "sol_1",
      problem: "Problem",
      solution: "Solution",
      tags: null,
      userId: null,
      score: 0,
      createdAt: new Date(),
    });

    expect(result).not.toHaveProperty("updatedAt");
  });
});
