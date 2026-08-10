import { CASE_CATEGORIES, STRATA, type BenchmarkDataset, type CaseCategory } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertUnique(values: readonly string[], label: string) {
  assert(new Set(values).size === values.length, `${label} must be unique`);
}

export function validateBenchmarkDataset(dataset: BenchmarkDataset) {
  assert(dataset.version === 1, "Dataset version must be 1");
  assert(dataset.families.length === 30, "Dataset must contain exactly 30 fix families");
  assert(dataset.solutions.length === 150, "Dataset must contain exactly 150 solution fixtures");
  assert(dataset.cases.length === 210, "Dataset must contain exactly 210 retrieval cases");

  const familyIds = dataset.families.map((family) => family.id);
  const solutionIds = dataset.solutions.map((solution) => solution.id);
  const caseIds = dataset.cases.map((retrievalCase) => retrievalCase.id);
  assertUnique(familyIds, "family IDs");
  assertUnique(solutionIds, "solution IDs");
  assertUnique(caseIds, "case IDs");

  for (const stratum of STRATA) {
    const count = dataset.families.filter((family) => family.stratum === stratum).length;
    assert(count === 5, `${stratum} must contain exactly 5 families`);
  }

  const familySet = new Set(familyIds);
  const solutionSet = new Set(solutionIds);
  const categoryCounts = Object.fromEntries(
    CASE_CATEGORIES.map((category) => [
      category,
      dataset.cases.filter((item) => item.category === category).length,
    ]),
  ) as Record<CaseCategory, number>;
  for (const category of CASE_CATEGORIES) {
    assert(categoryCounts[category] === 30, `${category} must contain 30 cases`);
    const development = dataset.cases.filter(
      (item) => item.category === category && item.split === "development",
    ).length;
    const test = dataset.cases.filter(
      (item) => item.category === category && item.split === "test",
    ).length;
    assert(development === 10, `${category} must contain 10 development cases`);
    assert(test === 20, `${category} must contain 20 test cases`);
  }

  for (const solution of dataset.solutions) {
    assert(familySet.has(solution.familyId), `${solution.id} references a missing family`);
    assert(solution.problem.trim().length > 0, `${solution.id} has no problem`);
    assert(solution.rootCause.trim().length > 0, `${solution.id} has no root cause`);
    assert(solution.solution.trim().length > 0, `${solution.id} has no solution`);
    assert(solution.verificationEvidence.length > 0, `${solution.id} has no verification evidence`);
    assert(
      Number.isInteger(solution.usefulnessVotes) && solution.usefulnessVotes >= 0,
      `${solution.id} has invalid usefulness votes`,
    );
    assert(solution.fingerprints.length > 0, `${solution.id} has no error fingerprints`);
    assert(
      solution.constraints.repository.trim().length > 0,
      `${solution.id} has no repository constraint`,
    );
    assert(
      solution.constraints.commitRange.trim().length > 0,
      `${solution.id} has no commit range`,
    );
    assert(
      solution.constraints.dependencyVersions &&
        Object.keys(solution.constraints.dependencyVersions).length > 0,
      `${solution.id} has no dependency constraints`,
    );
    assert(
      solution.provenance.sourceRef.trim().length > 0,
      `${solution.id} has no provenance reference`,
    );
    for (const relation of solution.relationships) {
      assert(
        solutionSet.has(relation.targetId),
        `${solution.id} relationship targets missing ${relation.targetId}`,
      );
      assert(relation.targetId !== solution.id, `${solution.id} cannot relate to itself`);
      assert(relation.evidence.trim().length > 0, `${solution.id} relationship has no evidence`);
    }
  }

  const familySolutionCounts = new Map<string, number>();
  for (const solution of dataset.solutions) {
    familySolutionCounts.set(
      solution.familyId,
      (familySolutionCounts.get(solution.familyId) ?? 0) + 1,
    );
  }
  for (const familyId of familyIds) {
    assert(
      familySolutionCounts.get(familyId) === 5,
      `${familyId} must have five solution variants`,
    );
  }

  const developmentCases = dataset.cases.filter((item) => item.split === "development");
  const testCases = dataset.cases.filter((item) => item.split === "test");
  assert(developmentCases.length === 70, "Dataset must contain exactly 70 development cases");
  assert(testCases.length === 140, "Dataset must contain exactly 140 held-out test cases");

  for (const retrievalCase of dataset.cases) {
    assert(
      familySet.has(retrievalCase.familyId),
      `${retrievalCase.id} references a missing family`,
    );
    assert(retrievalCase.queryText.trim().length > 0, `${retrievalCase.id} has no query text`);
    assert(
      retrievalCase.reuseSafety !== undefined,
      `${retrievalCase.id} has no reuse safety label`,
    );
    assert(retrievalCase.importantFiles.length > 0, `${retrievalCase.id} has no important files`);
    assert(retrievalCase.commands.length > 0, `${retrievalCase.id} has no commands`);
    assert(retrievalCase.errorStrings.length > 0, `${retrievalCase.id} has no error strings`);
    assert(
      retrievalCase.dangerousDistractors.length > 0,
      `${retrievalCase.id} needs a dangerous distractor`,
    );
    for (const solutionId of retrievalCase.relevantSolutionIds) {
      assert(
        solutionSet.has(solutionId),
        `${retrievalCase.id} references missing relevant solution ${solutionId}`,
      );
    }
    for (const distractor of retrievalCase.dangerousDistractors) {
      assert(
        solutionSet.has(distractor.solutionId),
        `${retrievalCase.id} references missing distractor ${distractor.solutionId}`,
      );
      assert(
        distractor.rejectionReason.trim().length > 0,
        `${retrievalCase.id} has an empty distractor reason`,
      );
    }
    if (retrievalCase.category === "no-useful-memory") {
      assert(retrievalCase.noUsefulMemory, `${retrievalCase.id} must be marked noUsefulMemory`);
      assert(
        retrievalCase.relevantSolutionIds.length === 0,
        `${retrievalCase.id} cannot have a relevant solution`,
      );
    } else {
      assert(
        !retrievalCase.noUsefulMemory,
        `${retrievalCase.id} must not be marked noUsefulMemory`,
      );
    }
    if (retrievalCase.category === "direct-reuse") {
      assert(retrievalCase.reuseSafety === "safe", `${retrievalCase.id} direct reuse must be safe`);
    }
    if (retrievalCase.category === "related-adaptation") {
      assert(
        retrievalCase.reuseSafety === "adapt",
        `${retrievalCase.id} related reuse must require adaptation`,
      );
    }
    if (retrievalCase.category === "lexical-irrelevant") {
      assert(
        retrievalCase.reuseSafety === "unsafe",
        `${retrievalCase.id} lexical negative must be unsafe`,
      );
    }
  }

  return {
    familyCount: dataset.families.length,
    solutionCount: dataset.solutions.length,
    caseCount: dataset.cases.length,
    developmentCases: developmentCases.length,
    testCases: testCases.length,
    categoryCounts,
  };
}
