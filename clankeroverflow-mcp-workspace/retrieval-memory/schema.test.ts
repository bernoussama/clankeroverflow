import { describe, expect, test } from "vitest";

import { benchmarkDataset } from "./fixtures.js";
import { CASE_CATEGORIES, STRATA } from "./types.js";
import { validateBenchmarkDataset } from "./validate.js";

describe("memory retrieval dataset", () => {
  test("has the exact planned shape and balanced strata/splits", () => {
    expect(validateBenchmarkDataset(benchmarkDataset)).toMatchObject({
      familyCount: 30,
      solutionCount: 150,
      caseCount: 210,
      developmentCases: 70,
      testCases: 140,
    });
    expect(benchmarkDataset.families).toHaveLength(30);
    expect(benchmarkDataset.solutions).toHaveLength(150);
    expect(benchmarkDataset.cases).toHaveLength(210);
    for (const stratum of STRATA) {
      expect(benchmarkDataset.families.filter((family) => family.stratum === stratum)).toHaveLength(
        5,
      );
    }
    for (const category of CASE_CATEGORIES) {
      const cases = benchmarkDataset.cases.filter(
        (retrievalCase) => retrievalCase.category === category,
      );
      expect(cases).toHaveLength(30);
      expect(cases.filter((retrievalCase) => retrievalCase.split === "development")).toHaveLength(
        10,
      );
      expect(cases.filter((retrievalCase) => retrievalCase.split === "test")).toHaveLength(20);
    }
  });

  test("retains typed relationships, structured constraints, and dangerous distractor reasons", () => {
    const solutionIds = new Set(benchmarkDataset.solutions.map((solution) => solution.id));
    expect(benchmarkDataset.solutions.some((solution) => solution.memoryKind === "plan")).toBe(
      true,
    );
    expect(benchmarkDataset.solutions.some((solution) => solution.usefulnessVotes > 0)).toBe(true);
    expect(
      benchmarkDataset.solutions.find((solution) => solution.id.endsWith("-stale-reverted"))
        ?.usefulnessVotes,
    ).toBe(0);
    expect(benchmarkDataset.solutions.some((solution) => solution.status === "reverted")).toBe(
      true,
    );
    expect(
      benchmarkDataset.solutions.some((solution) =>
        solution.relationships.some((relation) => relation.type === "conflicts_with"),
      ),
    ).toBe(true);
    for (const retrievalCase of benchmarkDataset.cases) {
      expect(retrievalCase.dangerousDistractors.length).toBeGreaterThan(0);
      for (const distractor of retrievalCase.dangerousDistractors) {
        expect(solutionIds.has(distractor.solutionId)).toBe(true);
        expect(distractor.rejectionReason.length).toBeGreaterThan(10);
      }
    }
  });

  test("keeps no-useful-memory cases distinct from lexical negative cases", () => {
    const none = benchmarkDataset.cases.filter((retrievalCase) => retrievalCase.noUsefulMemory);
    const lexical = benchmarkDataset.cases.filter(
      (retrievalCase) => retrievalCase.category === "lexical-irrelevant",
    );
    expect(none).toHaveLength(30);
    expect(lexical).toHaveLength(30);
    expect(lexical.every((retrievalCase) => !retrievalCase.noUsefulMemory)).toBe(true);
    expect(none.every((retrievalCase) => retrievalCase.relevantSolutionIds.length === 0)).toBe(
      true,
    );
  });
});
