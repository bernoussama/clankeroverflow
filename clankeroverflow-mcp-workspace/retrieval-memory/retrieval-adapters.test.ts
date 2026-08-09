import { describe, expect, test } from "vitest";

import { benchmarkDataset } from "./fixtures.js";
import {
  createFixtureReranker,
  RERANKER_FIXTURE_VERSION,
  RERANKER_MODEL_ID,
  RERANKER_REVISION,
} from "./reranker.js";
import {
  checkStructuredConstraints,
  createBenchmarkIndex,
  normalizeScore,
  retrieveCase,
} from "./retrieval.js";
import type { RequiredConstraints } from "./types.js";

describe("memory retrieval adapters", () => {
  test("hard-rejects inactive, mismatched-version, repository, platform, and root-cause candidates", () => {
    const family = benchmarkDataset.families[0]!;
    const solutions = benchmarkDataset.solutions.filter(
      (solution) => solution.familyId === family.id,
    );
    const direct = benchmarkDataset.cases.find(
      (retrievalCase) => retrievalCase.id === `${family.id}-direct-reuse`,
    )!;
    const canonical = solutions.find((solution) => solution.id.endsWith("-canonical"))!;
    const wrongVersion = solutions.find((solution) => solution.id.endsWith("-wrong-version"))!;
    const alternate = solutions.find((solution) => solution.id.endsWith("-alternate-root"))!;
    const stale = solutions.find((solution) => solution.id.endsWith("-stale-reverted"))!;

    expect(checkStructuredConstraints(canonical, direct.requiredConstraints).eligible).toBe(true);
    expect(
      checkStructuredConstraints(wrongVersion, direct.requiredConstraints).rejectionReasons,
    ).toContain("dependency version mismatch:vite");
    expect(
      checkStructuredConstraints(alternate, direct.requiredConstraints).rejectionReasons,
    ).toContain("contradictory root cause");
    expect(
      checkStructuredConstraints(stale, direct.requiredConstraints).rejectionReasons,
    ).toContain("status:reverted");
    expect(
      checkStructuredConstraints(canonical, {
        ...direct.requiredConstraints,
        repository: "sanitized/other",
      }).rejectionReasons,
    ).toContain("repository mismatch");
    expect(
      checkStructuredConstraints(canonical, {
        ...direct.requiredConstraints,
        platforms: ["windows"],
      }).rejectionReasons,
    ).toContain("platform mismatch");
  });

  test("normalizes scores into the bounded explanation range", () => {
    expect(normalizeScore(-1)).toBe(0);
    expect(normalizeScore(0.5)).toBe(0.5);
    expect(normalizeScore(2)).toBe(1);
    expect(normalizeScore(Number.NaN)).toBe(0);
  });

  test("checks every environment filter and keeps unknown metadata eligible", () => {
    const family = benchmarkDataset.families[0]!;
    const canonical = benchmarkDataset.solutions.find(
      (solution) => solution.id === `${family.id}-canonical`,
    )!;
    const direct = benchmarkDataset.cases.find(
      (retrievalCase) => retrievalCase.id === `${family.id}-direct-reuse`,
    )!;
    const mismatch = (patch: Partial<RequiredConstraints>) =>
      checkStructuredConstraints(canonical, { ...direct.requiredConstraints, ...patch });

    expect(mismatch({ dependencyVersions: { vite: "4.x" } }).rejectionReasons).toContain(
      "dependency version mismatch:vite",
    );
    expect(mismatch({ runtime: "Other runtime" }).rejectionReasons).toContain("runtime mismatch");
    expect(mismatch({ toolchain: "Other toolchain" }).rejectionReasons).toContain(
      "toolchain mismatch",
    );
    expect(mismatch({ packageManager: "npm" }).rejectionReasons).toContain(
      "packageManager mismatch",
    );
    expect(mismatch({ os: "macOS" }).rejectionReasons).toContain("os mismatch");
    expect(mismatch({ architecture: "arm64" }).rejectionReasons).toContain("architecture mismatch");
    expect(mismatch({ platforms: ["windows"] }).rejectionReasons).toContain("platform mismatch");
    expect(mismatch({ rootCauseKey: "other-root" }).rejectionReasons).toContain(
      "contradictory root cause",
    );

    const lowConfidence = { ...canonical, confidence: "low" as const };
    expect(
      checkStructuredConstraints(lowConfidence, direct.requiredConstraints).rejectionReasons,
    ).toContain("confidence:low");

    const incomplete = {
      ...canonical,
      constraints: { ...canonical.constraints, dependencyVersions: {}, platforms: [] },
    };
    const incompleteResult = checkStructuredConstraints(incomplete, direct.requiredConstraints);
    expect(incompleteResult.eligible).toBe(true);
    expect(incompleteResult.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "dependency:vite", status: "unknown" }),
        expect.objectContaining({ name: "platforms", status: "unknown" }),
      ]),
    );
  });

  test("uses the committed reranker fixtures without network access", async () => {
    const reranker = createFixtureReranker({ cacheDir: ".cache/test" });
    const score = await reranker.score({
      queryId: "vite-container-host-direct-reuse",
      solutionId: "vite-container-host-canonical",
      queryText: "ignored fixture query",
      solutionText: "ignored fixture solution",
    });
    expect(reranker.provider).toBe("cached-fixture");
    expect(reranker.modelId).toBe(RERANKER_FIXTURE_VERSION);
    expect(reranker.revision).toBe(RERANKER_FIXTURE_VERSION);
    expect(RERANKER_MODEL_ID).toBe("Xenova/ms-marco-MiniLM-L-6-v2");
    expect(RERANKER_REVISION).toBe("e746e4abf0750f080e1e996a20dfcb32482661f2");
    expect(score).toBe(0.98);
  });

  test("runs the existing local keyword/vector/RRF adapters on one shared candidate pool", async () => {
    const family = benchmarkDataset.families[0]!;
    const dataset = {
      ...benchmarkDataset,
      families: [family],
      solutions: benchmarkDataset.solutions.filter((solution) => solution.familyId === family.id),
      cases: benchmarkDataset.cases.filter((retrievalCase) => retrievalCase.familyId === family.id),
    };
    const index = await createBenchmarkIndex(dataset, {
      embeddingMode: "deterministic",
      methods: ["keyword", "structured"],
    });
    try {
      const retrievalCase = dataset.cases.find((item) => item.category === "direct-reuse")!;
      const options = {
        embeddingMode: "deterministic" as const,
        reranker: createFixtureReranker({ cacheDir: ".cache/test" }),
        methods: ["keyword", "structured"] as const,
      };
      const keyword = await retrieveCase(index, retrievalCase, "keyword", options);
      const structured = await retrieveCase(index, retrievalCase, "structured", options);
      expect(keyword.traces.length).toBeGreaterThan(0);
      expect(structured.traces.length).toBeGreaterThan(0);
      expect(keyword.ranking.length).toBeGreaterThan(0);
      expect(structured.ranking.length).toBeGreaterThan(0);
      expect(structured.traces.some((trace) => trace.rejected && trace.status === "reverted")).toBe(
        true,
      );
      expect(structured.traces.some((trace) => trace.relationshipEvidence.length > 0)).toBe(true);
      expect(
        structured.traces.some(
          (trace) =>
            trace.rejected &&
            trace.rejectionReasons.length > 0 &&
            trace.constraintChecks.length > 0,
        ),
      ).toBe(true);
    } finally {
      index.close();
    }
  });
});
