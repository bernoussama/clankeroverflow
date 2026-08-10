import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SolutionResult } from "../../packages/cli/src/mcp/backend.js";
import { LocalBackend } from "../../packages/cli/src/mcp/local-backend.js";
import { benchmarkDataset, solutionDocumentText } from "./fixtures.js";
import type {
  BenchmarkDataset,
  ConstraintCheck,
  EnvironmentConstraints,
  ExplanationTrace,
  MethodQueryResult,
  RequiredConstraints,
  RetrievalCase,
  RetrievalMethod,
  SolutionFixture,
} from "./types.js";

export type RetrievalOptions = { methods: readonly RetrievalMethod[] };

export type RawMethodResult = {
  method: RetrievalMethod;
  ranking: string[];
  scores: Map<string, number>;
  traces: ExplanationTrace[];
};

export type BenchmarkIndex = {
  backend: LocalBackend;
  directory: string;
  solutions: readonly SolutionFixture[];
  fixtureIdByBackendId: ReadonlyMap<string, string>;
  close(): void;
};

function keywordSafeQuery(text: string) {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).join(" ");
}

export async function createBenchmarkIndex(
  dataset: BenchmarkDataset = benchmarkDataset,
): Promise<BenchmarkIndex> {
  const directory = mkdtempSync(join(tmpdir(), "clanker-memory-retrieval-"));
  const backend = new LocalBackend(join(directory, "benchmark.sqlite"));
  const fixtureIdByBackendId = new Map<string, string>();
  try {
    for (const solution of dataset.solutions) {
      const logged = await backend.log({
        problem: solution.problem,
        solution: solutionDocumentText(solution),
        tags: solution.tags.join(","),
      });
      fixtureIdByBackendId.set(logged.id, solution.id);
    }
  } catch (error) {
    backend.close();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    backend,
    directory,
    solutions: dataset.solutions,
    fixtureIdByBackendId,
    close() {
      backend.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function versionOverlap(required: string, candidate: string | undefined) {
  if (!candidate) return { status: "unknown" as const, detail: "candidate version is unknown" };
  if (required === candidate || required === "*" || candidate === "*") {
    return { status: "pass" as const, detail: `version ${candidate} overlaps ${required}` };
  }
  const requiredMajor = required.match(/^(\d+)\.x/);
  const candidateMajor = candidate.match(/^(\d+)\.x/);
  if (requiredMajor && candidateMajor && requiredMajor[1] === candidateMajor[1]) {
    return { status: "pass" as const, detail: `major version overlaps ${required}` };
  }
  return { status: "fail" as const, detail: `${candidate} does not overlap ${required}` };
}

function exactCheck(
  name: string,
  required: string,
  candidate: string | undefined,
): ConstraintCheck {
  if (!candidate) return { name, status: "unknown", detail: `candidate does not record ${name}` };
  return candidate === required
    ? { name, status: "pass", detail: `${candidate} matches ${required}` }
    : { name, status: "fail", detail: `${candidate} does not match ${required}` };
}

export function checkStructuredConstraints(
  solution: SolutionFixture,
  required: RequiredConstraints,
): { eligible: boolean; checks: ConstraintCheck[]; rejectionReasons: string[] } {
  const checks: ConstraintCheck[] = [];
  const rejectionReasons: string[] = [];
  const confidence: ConstraintCheck = {
    name: "confidence",
    status: solution.confidence === "low" ? "fail" : "pass",
    detail: `memory confidence is ${solution.confidence}`,
  };
  checks.push(confidence);
  if (confidence.status === "fail") rejectionReasons.push("confidence:low");
  const status: ConstraintCheck = {
    name: "status",
    status: solution.status === "active" ? "pass" : "fail",
    detail: `memory status is ${solution.status}`,
  };
  checks.push(status);
  if (status.status === "fail") rejectionReasons.push(`status:${solution.status}`);

  const repository = exactCheck("repository", required.repository, solution.constraints.repository);
  checks.push(repository);
  if (repository.status === "fail") rejectionReasons.push("repository mismatch");
  for (const [name, version] of Object.entries(required.dependencyVersions)) {
    const result = versionOverlap(version, solution.constraints.dependencyVersions[name]);
    checks.push({ name: `dependency:${name}`, ...result });
    if (result.status === "fail") rejectionReasons.push(`dependency version mismatch:${name}`);
  }
  for (const [name, requiredValue, candidateValue] of [
    ["runtime", required.runtime, solution.constraints.runtime],
    ["toolchain", required.toolchain, solution.constraints.toolchain],
    ["packageManager", required.packageManager, solution.constraints.packageManager],
    ["os", required.os, solution.constraints.os],
    ["architecture", required.architecture, solution.constraints.architecture],
  ] as const) {
    const check = exactCheck(name, requiredValue, candidateValue);
    checks.push(check);
    if (check.status === "fail") rejectionReasons.push(`${name} mismatch`);
  }
  const platforms = new Set(solution.constraints.platforms);
  const overlap = required.platforms.filter((platform) => platforms.has(platform));
  const platformCheck: ConstraintCheck = {
    name: "platforms",
    status:
      required.platforms.length === 0 || solution.constraints.platforms.length === 0
        ? "unknown"
        : overlap.length
          ? "pass"
          : "fail",
    detail: overlap.length ? `overlap: ${overlap.join(", ")}` : "no platform overlap",
  };
  checks.push(platformCheck);
  if (platformCheck.status === "fail") rejectionReasons.push("platform mismatch");
  if (required.rootCauseKey) {
    const rootCause = exactCheck(
      "rootCauseKey",
      required.rootCauseKey,
      solution.constraints.rootCauseKey,
    );
    checks.push(rootCause);
    if (rootCause.status === "fail") rejectionReasons.push("contradictory root cause");
  }
  return { eligible: rejectionReasons.length === 0, checks, rejectionReasons };
}

function remap(index: BenchmarkIndex, results: readonly SolutionResult[]) {
  return results.map((result) => ({
    ...result,
    id: index.fixtureIdByBackendId.get(result.id) ?? result.id,
  }));
}

export async function retrieveCase(
  index: BenchmarkIndex,
  retrievalCase: RetrievalCase,
  method: RetrievalMethod,
  _options?: RetrievalOptions,
): Promise<RawMethodResult> {
  const results = remap(
    index,
    await index.backend.search({
      query: keywordSafeQuery(retrievalCase.queryText),
      limit: index.solutions.length,
      keywordStrategy: "tiered",
    }),
  );
  const ranking = results.map((result) => result.id);
  const scores = new Map(ranking.map((id, rank) => [id, 1 - rank / Math.max(ranking.length, 1)]));
  const selected = new Set(ranking.slice(0, 10));
  const solutionById = new Map(index.solutions.map((solution) => [solution.id, solution]));
  const traceIds = new Set([
    ...ranking.slice(0, 10),
    ...retrievalCase.dangerousDistractors.map((item) => item.solutionId),
  ]);
  const traces = [...traceIds].flatMap((id) => {
    const solution = solutionById.get(id);
    if (!solution) return [];
    const constraint = checkStructuredConstraints(solution, retrievalCase.requiredConstraints);
    return [
      {
        solutionId: id,
        lexicalRank: ranking.indexOf(id) === -1 ? null : ranking.indexOf(id) + 1,
        matchedFingerprints: solution.fingerprints.filter((fingerprint) =>
          retrievalCase.queryText.toLowerCase().includes(fingerprint.toLowerCase()),
        ),
        constraintChecks: constraint.checks,
        status: solution.status,
        confidence: solution.confidence,
        relationshipEvidence: solution.relationships,
        selected: selected.has(id),
        rejected: false,
        rejectionReasons: [],
      } satisfies ExplanationTrace,
    ];
  });
  return { method, ranking, scores, traces };
}

export function finalizeMethodQueryResult(
  raw: RawMethodResult,
  threshold: number,
): MethodQueryResult {
  const topScore = raw.ranking.length ? (raw.scores.get(raw.ranking[0]!) ?? 0) : 0;
  const abstained = raw.ranking.length === 0 || topScore < threshold;
  const returnedIds = abstained ? [] : raw.ranking.slice(0, 10);
  const selected = new Set(returnedIds);
  return {
    queryId: "",
    rawRanking: raw.ranking,
    returnedIds,
    abstained,
    topScore,
    explanationTrace: raw.traces.map((trace) => ({
      ...trace,
      selected: selected.has(trace.solutionId),
    })),
  };
}

export function resultForCase(
  raw: RawMethodResult,
  retrievalCase: RetrievalCase,
  threshold: number,
): MethodQueryResult {
  return { ...finalizeMethodQueryResult(raw, threshold), queryId: retrievalCase.id };
}

export function constraintChecksFor(
  solutions: readonly SolutionFixture[],
  required: RequiredConstraints,
) {
  return new Map(
    solutions.map((solution) => [solution.id, checkStructuredConstraints(solution, required)]),
  );
}

export function solutionConstraints(solution: SolutionFixture): EnvironmentConstraints {
  return solution.constraints;
}
