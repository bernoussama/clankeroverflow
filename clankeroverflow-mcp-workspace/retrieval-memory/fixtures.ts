import { familyDefinitions } from "./families.js";
import type {
  BenchmarkDataset,
  CaseCategory,
  EnvironmentConstraints,
  FixFamily,
  RequiredConstraints,
  Relationship,
  RetrievalCase,
  SolutionFixture,
} from "./types.js";

const CAPTURED_AT = "2026-08-01";

function repositoryFor(family: FixFamily) {
  return `sanitized/${family.id}`;
}

function constraintsFor(
  family: FixFamily,
  overrides: Partial<Pick<EnvironmentConstraints, "dependencyVersions" | "rootCauseKey">> = {},
): EnvironmentConstraints {
  return {
    repository: repositoryFor(family),
    commitRange: family.commitRange,
    dependencyVersions: { ...family.versions, ...overrides.dependencyVersions },
    runtime: family.runtime,
    toolchain: family.toolchain,
    packageManager: family.packageManager,
    os: family.os,
    architecture: family.architecture,
    platforms: [...family.platforms],
    rootCauseKey: overrides.rootCauseKey ?? family.rootCauseKey,
  };
}

function requiredConstraintsFor(
  family: FixFamily,
  overrides: Partial<RequiredConstraints> = {},
): RequiredConstraints {
  return {
    repository: repositoryFor(family),
    dependencyVersions: { ...family.versions, ...overrides.dependencyVersions },
    runtime: family.runtime,
    toolchain: family.toolchain,
    packageManager: family.packageManager,
    os: family.os,
    architecture: family.architecture,
    platforms: [...family.platforms],
    ...(overrides.rootCauseKey ? { rootCauseKey: overrides.rootCauseKey } : {}),
  };
}

function provenance(
  family: FixFamily,
  source: "sanitized-real-world-pattern" | "controlled-adversarial-variant",
  evidence: string[],
) {
  return {
    source,
    sourceRef: `family:${family.id}`,
    capturedAt: CAPTURED_AT,
    evidence,
  } as const;
}

function relationship(
  type: Relationship["type"],
  targetId: string,
  evidence: string,
): Relationship {
  return { type, targetId, evidence };
}

function solutionBase(
  family: FixFamily,
  id: string,
  input: Pick<
    SolutionFixture,
    | "title"
    | "problem"
    | "rootCause"
    | "solution"
    | "verificationEvidence"
    | "memoryKind"
    | "status"
    | "confidence"
  > & {
    usefulnessVotes?: number;
    constraints?: EnvironmentConstraints;
    source?: "sanitized-real-world-pattern" | "controlled-adversarial-variant";
    relationships?: Relationship[];
    tags?: string[];
    fingerprints?: string[];
  },
): SolutionFixture {
  return {
    id,
    familyId: family.id,
    title: input.title,
    problem: input.problem,
    rootCause: input.rootCause,
    solution: input.solution,
    verificationEvidence: input.verificationEvidence,
    memoryKind: input.memoryKind,
    status: input.status,
    confidence: input.confidence,
    usefulnessVotes: input.usefulnessVotes ?? 0,
    constraints: input.constraints ?? constraintsFor(family),
    provenance: provenance(
      family,
      input.source ?? "sanitized-real-world-pattern",
      input.verificationEvidence,
    ),
    relationships: input.relationships ?? [],
    fingerprints: input.fingerprints ?? family.fingerprints,
    importantFiles: family.files,
    commands: family.commands,
    errorStrings: family.errors,
    tags: [...family.tags, input.memoryKind],
  };
}

function buildSolutions(families: readonly FixFamily[]) {
  const solutions: SolutionFixture[] = [];
  for (const family of families) {
    const canonicalId = `${family.id}-canonical`;
    const adaptationId = `${family.id}-adaptation-plan`;
    const wrongVersionId = `${family.id}-wrong-version`;
    const alternateId = `${family.id}-alternate-root`;
    const staleId = `${family.id}-stale-reverted`;
    const primaryVersionKey = Object.keys(family.versions)[0]!;
    const primaryVersion = family.versions[primaryVersionKey]!;

    solutions.push(
      solutionBase(family, canonicalId, {
        title: family.title,
        problem: family.problem,
        rootCause: family.rootCause,
        solution: family.solution,
        verificationEvidence: family.verification,
        memoryKind: "solution",
        status: "active",
        confidence: "high",
        usefulnessVotes: 12,
        relationships: [
          relationship(
            "supersedes",
            staleId,
            "The verified current fix replaced the reverted historical workaround.",
          ),
        ],
      }),
      solutionBase(family, adaptationId, {
        title: `${family.title} adapted plan`,
        problem: `A related task needs the ${family.packageName} fix, but its surrounding deployment or request lifecycle differs from the original case.`,
        rootCause: `${family.rootCause} The current task also requires adapting the sequencing and verification steps to its adjacent environment.`,
        solution: `Use the reusable ${family.packageName} approach as a plan template, then adapt the configuration and verification to the current files and runtime before applying it. Start with the smallest ${family.fingerprints[0]} reproduction and preserve the ${family.commands[0]} check.`,
        verificationEvidence: [
          "The adapted plan was reviewed against the current environment before execution.",
          "The focused verification command passed after the environment-specific step was changed.",
        ],
        memoryKind: "plan",
        status: "active",
        confidence: "medium",
        usefulnessVotes: 5,
        relationships: [
          relationship(
            "adapts",
            canonicalId,
            "This plan reuses the root cause but requires environment-specific sequencing.",
          ),
        ],
        tags: ["adaptation"],
        fingerprints: [...family.fingerprints, "adapt before reuse"],
      }),
      solutionBase(family, wrongVersionId, {
        title: `${family.title} on a previous dependency version`,
        problem: `${family.problem} The captured answer was written for a previous ${family.packageName} release.`,
        rootCause: `The historical ${family.packageName} version used a different API or runtime contract than the current environment.`,
        solution: `Use the legacy ${family.packageName} configuration from the previous release only in that environment; do not copy it into the current ${primaryVersion} setup without checking the release-specific API.`,
        verificationEvidence: [
          "The historical command passed only in the pinned legacy environment.",
        ],
        memoryKind: "solution",
        status: "active",
        confidence: "high",
        usefulnessVotes: 1,
        constraints: constraintsFor(family, {
          dependencyVersions: { [primaryVersionKey]: `legacy-${primaryVersion}` },
        }),
        source: "controlled-adversarial-variant",
        relationships: [
          relationship(
            "related_to",
            canonicalId,
            "Same family and symptom, but the dependency constraint is non-overlapping.",
          ),
        ],
        tags: ["wrong-version"],
        fingerprints: [...family.fingerprints, "legacy version"],
      }),
      solutionBase(family, alternateId, {
        title: `${family.title} with a different root cause`,
        problem: family.alternateRootCause.problem,
        rootCause: family.alternateRootCause.rootCause,
        solution: family.alternateRootCause.solution,
        verificationEvidence: family.alternateRootCause.verification,
        memoryKind: "solution",
        status: "active",
        confidence: "high",
        usefulnessVotes: 2,
        constraints: constraintsFor(family, { rootCauseKey: family.alternateRootCause.key }),
        source: "controlled-adversarial-variant",
        relationships: [
          relationship(
            "conflicts_with",
            canonicalId,
            "The error string overlaps, but the root-cause discriminator is different.",
          ),
        ],
        fingerprints: family.alternateRootCause.fingerprints,
        tags: ["alternate-root-cause"],
      }),
      solutionBase(family, staleId, {
        title: `${family.title} reverted workaround`,
        problem: `${family.problem} An earlier workaround was later reverted after it caused a regression.`,
        rootCause: family.rootCause,
        solution: `Do not use the reverted workaround: ${family.solution} A later verification run found that the earlier shortcut was unsafe for this environment.`,
        verificationEvidence: [
          "The historical workaround was explicitly marked reverted after a regression reproduction.",
        ],
        memoryKind: "solution",
        status: "reverted",
        confidence: "low",
        usefulnessVotes: 0,
        source: "controlled-adversarial-variant",
        relationships: [
          relationship(
            "reverts",
            canonicalId,
            "This memory records the failed historical path and must remain auditable but inactive.",
          ),
        ],
        tags: ["stale", "reverted"],
        fingerprints: [...family.fingerprints, "reverted workaround"],
      }),
    );
  }
  return solutions;
}

function splitForFamily(familyIndex: number): "development" | "test" {
  return familyIndex < 10 ? "development" : "test";
}

function caseBase(
  family: FixFamily,
  familyIndex: number,
  category: CaseCategory,
): Pick<RetrievalCase, "id" | "familyId" | "stratum" | "category" | "split"> {
  return {
    id: `${family.id}-${category}`,
    familyId: family.id,
    stratum: family.stratum,
    category,
    split: splitForFamily(familyIndex),
  };
}

function buildCases(families: readonly FixFamily[], solutions: readonly SolutionFixture[]) {
  const byFamily = new Map<string, SolutionFixture[]>();
  for (const solution of solutions) {
    const group = byFamily.get(solution.familyId) ?? [];
    group.push(solution);
    byFamily.set(solution.familyId, group);
  }

  const cases: RetrievalCase[] = [];
  for (const [familyIndex, family] of families.entries()) {
    const group = byFamily.get(family.id)!;
    const canonical = group.find((solution) => solution.id.endsWith("-canonical"))!;
    const adaptation = group.find((solution) => solution.id.endsWith("-adaptation-plan"))!;
    const wrongVersion = group.find((solution) => solution.id.endsWith("-wrong-version"))!;
    const alternate = group.find((solution) => solution.id.endsWith("-alternate-root"))!;
    const stale = group.find((solution) => solution.id.endsWith("-stale-reverted"))!;
    const baseRequired = requiredConstraintsFor(family, { rootCauseKey: family.rootCauseKey });
    const common = {
      importantFiles: family.files,
      commands: family.commands,
      errorStrings: family.errors,
    };

    cases.push(
      {
        ...caseBase(family, familyIndex, "direct-reuse"),
        queryText: `${family.problem} ${family.errors.join(" ")} What verified fix should be reused in this exact environment?`,
        relevantSolutionIds: [canonical.id],
        reuseSafety: "safe",
        requiredConstraints: baseRequired,
        ...common,
        dangerousDistractors: [
          {
            solutionId: stale.id,
            rejectionReason:
              "The memory is explicitly reverted and must not be returned as the active fix.",
          },
          {
            solutionId: wrongVersion.id,
            rejectionReason:
              "The dependency version is non-overlapping with the current environment.",
          },
        ],
        noUsefulMemory: false,
      },
      {
        ...caseBase(family, familyIndex, "related-adaptation"),
        queryText: `A related ${family.packageName} task has a similar ${family.errors[0]} symptom, but the surrounding runtime and files differ. Give a plan that must be adapted before reuse.`,
        relevantSolutionIds: [adaptation.id, canonical.id],
        reuseSafety: "adapt",
        requiredConstraints: requiredConstraintsFor(family),
        ...common,
        dangerousDistractors: [
          {
            solutionId: canonical.id,
            rejectionReason:
              "The canonical answer is a starting point, not a copy-paste-safe plan for the changed context.",
          },
          { solutionId: stale.id, rejectionReason: "The historical workaround is reverted." },
        ],
        noUsefulMemory: false,
      },
      {
        ...caseBase(family, familyIndex, "lexical-irrelevant"),
        queryText: `A toy generated-fixture process emits ${family.errors[0]}, and its log formatter mentions ${family.packageName}, but there is no ${family.runtime} service, package, or file from this family. The ${family.title.toLowerCase()} fix is irrelevant.`,
        relevantSolutionIds: [],
        reuseSafety: "unsafe",
        requiredConstraints: requiredConstraintsFor(family, {
          rootCauseKey: `unrelated-${family.id}`,
        }),
        ...common,
        dangerousDistractors: [
          {
            solutionId: canonical.id,
            rejectionReason:
              "Shared error/package words are lexical overlap only; the required runtime and root cause are absent.",
          },
          {
            solutionId: alternate.id,
            rejectionReason:
              "The alternate root cause also assumes the family runtime and files exist.",
          },
        ],
        noUsefulMemory: false,
      },
      {
        ...caseBase(family, familyIndex, "different-version"),
        queryText: `${family.problem} Current dependency constraints are ${JSON.stringify(family.versions)}. A saved result mentions ${wrongVersion.constraints.dependencyVersions[Object.keys(family.versions)[0]!]}; which result is safe for the current version?`,
        relevantSolutionIds: [canonical.id],
        reuseSafety: "safe",
        requiredConstraints: baseRequired,
        ...common,
        dangerousDistractors: [
          {
            solutionId: wrongVersion.id,
            rejectionReason:
              "Its structured dependency version does not overlap the current requirement.",
          },
        ],
        noUsefulMemory: false,
      },
      {
        ...caseBase(family, familyIndex, "same-error-different-root-cause"),
        queryText: `${family.alternateRootCause.problem} The visible error is ${family.errors[0]}, but the root-cause clue is ${family.alternateRootCause.rootCause}. Select the fix for this root cause, not the canonical same-error fix.`,
        relevantSolutionIds: [alternate.id],
        reuseSafety: "safe",
        requiredConstraints: requiredConstraintsFor(family, {
          rootCauseKey: family.alternateRootCause.key,
        }),
        ...common,
        dangerousDistractors: [
          {
            solutionId: canonical.id,
            rejectionReason: "The canonical solution has a contradictory root-cause discriminator.",
          },
        ],
        noUsefulMemory: false,
      },
      {
        ...caseBase(family, familyIndex, "stale-or-reverted"),
        queryText: `${family.problem} The search may surface an older workaround that was later reverted. Return only the verified active fix for ${family.rootCause}.`,
        relevantSolutionIds: [canonical.id],
        reuseSafety: "safe",
        requiredConstraints: baseRequired,
        ...common,
        dangerousDistractors: [
          {
            solutionId: stale.id,
            rejectionReason:
              "Status is reverted; preserve it for provenance but exclude it from active retrieval.",
          },
        ],
        noUsefulMemory: false,
      },
      {
        ...caseBase(family, familyIndex, "no-useful-memory"),
        queryText: `${family.noUsefulQuery.problem} ${family.noUsefulQuery.error}. Do not invent or copy a stored ${family.packageName} fix when the required system is absent.`,
        relevantSolutionIds: [],
        reuseSafety: "none",
        requiredConstraints: requiredConstraintsFor(family, {
          repository: `sanitized/unknown/${family.id}`,
          rootCauseKey: `unknown-${family.id}`,
        }),
        ...common,
        dangerousDistractors: [
          {
            solutionId: canonical.id,
            rejectionReason:
              "No stored memory satisfies the unknown repository and root-cause constraints.",
          },
          {
            solutionId: stale.id,
            rejectionReason:
              "The closest historical memory is reverted and also belongs to another repository.",
          },
        ],
        noUsefulMemory: true,
      },
    );
  }
  return cases;
}

const solutions = buildSolutions(familyDefinitions);
const cases = buildCases(familyDefinitions, solutions);

export const benchmarkDataset: BenchmarkDataset = {
  version: 1,
  families: familyDefinitions,
  solutions,
  cases,
};

export function solutionDocumentText(solution: SolutionFixture) {
  return [
    `Title: ${solution.title}`,
    `Tags: ${solution.tags.join(", ")}`,
    `Problem: ${solution.problem}`,
    `Root cause: ${solution.rootCause}`,
    `Solution: ${solution.solution}`,
    `Verification: ${solution.verificationEvidence.join(" ")}`,
    `Fingerprints: ${solution.fingerprints.join(", ")}`,
  ].join("\n");
}

export function caseExpectedAbstention(retrievalCase: RetrievalCase) {
  return retrievalCase.reuseSafety === "unsafe" || retrievalCase.reuseSafety === "none";
}
