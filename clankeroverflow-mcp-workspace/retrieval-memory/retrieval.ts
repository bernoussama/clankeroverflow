import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SolutionResult } from "../../packages/cli/src/mcp/backend.js";
import { LocalBackend } from "../../packages/cli/src/mcp/local-backend.js";
import { floatVectorToBuffer } from "../../packages/cli/src/mcp/local-semantic.js";
import { benchmarkDataset, solutionDocumentText } from "./fixtures.js";
import { createReranker, rerankerInput, type Reranker } from "./reranker.js";
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

const EMBEDDING_DIMENSIONS = 128;
const RRF_K = 60;
const KEYWORD_WEIGHT = 1.25;
const SEMANTIC_WEIGHT = 1;
const FINGERPRINT_BOOST = 0.05;

export type EmbeddingMode = "deterministic" | "local";

export type RetrievalOptions = {
  embeddingMode: EmbeddingMode;
  embeddingModelPath?: string;
  reranker: Reranker;
  methods: readonly RetrievalMethod[];
};

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

function normalizedTokens(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function keywordSafeQuery(text: string) {
  // Benchmark prose contains JSON, code punctuation, and parenthesized errors.
  // Feed only normalized literal tokens to the existing FTS parser so an
  // incidental `word:` or `)` cannot become advanced FTS syntax. The original
  // query remains intact in the case and explanation trace.
  return normalizedTokens(text).join(" ");
}

function hashEmbedding(text: string) {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (const token of normalizedTokens(text)) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
    const sign = digest[4]! % 2 === 0 ? 1 : -1;
    vector[index]! += sign * (1 + digest[5]! / 255);
  }
  const magnitude = Math.hypot(...vector);
  return floatVectorToBuffer(
    magnitude === 0 ? vector : vector.map((value) => value / magnitude),
    EMBEDDING_DIMENSIONS,
  );
}

function writeFakeEmbeddingModel(path: string) {
  writeFileSync(path, Buffer.from("GGUF memory-retrieval-deterministic-embedding-v1"));
}

export async function createBenchmarkIndex(
  dataset: BenchmarkDataset = benchmarkDataset,
  options: Pick<RetrievalOptions, "embeddingMode" | "embeddingModelPath" | "methods"> = {
    embeddingMode: "deterministic",
    methods: ["keyword"],
  },
): Promise<BenchmarkIndex> {
  const directory = mkdtempSync(join(tmpdir(), "clanker-memory-retrieval-"));
  const needsSemantic = options.methods.some((method) => method !== "keyword");
  let modelPath = options.embeddingModelPath;
  let dimensions = EMBEDDING_DIMENSIONS;
  if (needsSemantic && options.embeddingMode === "deterministic") {
    modelPath = join(directory, "deterministic-embedding.gguf");
    writeFakeEmbeddingModel(modelPath);
  }
  if (needsSemantic && options.embeddingMode === "local") {
    if (!modelPath)
      throw new Error("--embedding-model is required when --embedding-mode local is selected");
    dimensions = 384;
  }

  const semantic = needsSemantic
    ? {
        enabled: true,
        modelId:
          options.embeddingMode === "local" ? "bge-small-en-v1.5-q8_0" : "deterministic-memory-v1",
        modelPath: modelPath!,
        dimensions,
      }
    : undefined;
  const backend = new LocalBackend(join(directory, "benchmark.sqlite"), {
    semantic,
    ...(needsSemantic && options.embeddingMode === "deterministic"
      ? { embedder: { embed: async (text: string) => hashEmbedding(text) } }
      : {}),
  });
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

function rankMap(results: readonly SolutionResult[]) {
  return new Map(results.map((result, index) => [result.id, index + 1]));
}

function remapResults(index: BenchmarkIndex, results: readonly SolutionResult[]) {
  return results.map((result) => ({
    ...result,
    id: index.fixtureIdByBackendId.get(result.id) ?? result.id,
  }));
}

function rankScore(rank: number | undefined, total: number) {
  if (!rank) return 0;
  return 1 - (rank - 1) / Math.max(total - 1, 1);
}

function rrfScore(
  id: string,
  lexicalRanks: ReadonlyMap<string, number>,
  semanticRanks: ReadonlyMap<string, number>,
) {
  const lexicalRank = lexicalRanks.get(id);
  const semanticRank = semanticRanks.get(id);
  const score =
    (lexicalRank ? KEYWORD_WEIGHT / (RRF_K + lexicalRank) : 0) +
    (semanticRank ? SEMANTIC_WEIGHT / (RRF_K + semanticRank) : 0);
  return score;
}

function versionOverlap(required: string, candidate: string | undefined) {
  if (!candidate)
    return {
      status: "unknown" as const,
      detail: `candidate does not record a version for ${required}`,
    };
  if (required === candidate || required === "*" || candidate === "*") {
    return { status: "pass" as const, detail: `version ${candidate} overlaps ${required}` };
  }
  const requiredMajor = required.match(/^(\d+)\.x/);
  const candidateMajor = candidate.match(/^(\d+)\.x/);
  if (requiredMajor && candidateMajor && requiredMajor[1] === candidateMajor[1]) {
    return {
      status: "pass" as const,
      detail: `major version ${candidateMajor[1]} overlaps ${required}`,
    };
  }
  return {
    status: "fail" as const,
    detail: `candidate version ${candidate} does not overlap ${required}`,
  };
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
  const confidenceCheck: ConstraintCheck = {
    name: "confidence",
    status: solution.confidence === "low" ? "fail" : "pass",
    detail:
      solution.confidence === "low"
        ? "low-confidence memory is excluded from default retrieval"
        : `${solution.confidence}-confidence memory is eligible for default retrieval`,
  };
  checks.push(confidenceCheck);
  if (confidenceCheck.status === "fail") rejectionReasons.push("confidence:low");
  const statusCheck: ConstraintCheck = {
    name: "status",
    status: solution.status === "active" ? "pass" : "fail",
    detail: `memory status is ${solution.status}`,
  };
  checks.push(statusCheck);
  if (statusCheck.status === "fail") rejectionReasons.push(`status:${solution.status}`);

  const repositoryCheck = exactCheck(
    "repository",
    required.repository,
    solution.constraints.repository,
  );
  checks.push(repositoryCheck);
  if (repositoryCheck.status === "fail") rejectionReasons.push("repository mismatch");

  for (const [name, version] of Object.entries(required.dependencyVersions)) {
    const result = versionOverlap(version, solution.constraints.dependencyVersions[name]);
    const check = { name: `dependency:${name}`, ...result } satisfies ConstraintCheck;
    checks.push(check);
    if (check.status === "fail") rejectionReasons.push(`dependency version mismatch:${name}`);
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

  const candidatePlatforms = new Set(solution.constraints.platforms);
  const platformOverlap = required.platforms.filter((platform) => candidatePlatforms.has(platform));
  const platformCheck: ConstraintCheck = {
    name: "platforms",
    status:
      required.platforms.length === 0 || solution.constraints.platforms.length === 0
        ? "unknown"
        : platformOverlap.length > 0
          ? "pass"
          : "fail",
    detail:
      platformOverlap.length > 0 ? `overlap: ${platformOverlap.join(", ")}` : "no platform overlap",
  };
  checks.push(platformCheck);
  if (platformCheck.status === "fail") rejectionReasons.push("platform mismatch");

  if (required.rootCauseKey) {
    const rootCauseCheck = exactCheck(
      "rootCauseKey",
      required.rootCauseKey,
      solution.constraints.rootCauseKey,
    );
    checks.push(rootCauseCheck);
    if (rootCauseCheck.status === "fail") rejectionReasons.push("contradictory root cause");
  } else {
    checks.push({
      name: "rootCauseKey",
      status: "unknown",
      detail: "query did not provide a root-cause discriminator",
    });
  }

  return { eligible: rejectionReasons.length === 0, checks, rejectionReasons };
}

function fingerprintMatches(retrievalCase: RetrievalCase, solution: SolutionFixture) {
  const query = `${retrievalCase.queryText} ${retrievalCase.errorStrings.join(" ")}`.toLowerCase();
  return solution.fingerprints.filter((fingerprint) => query.includes(fingerprint.toLowerCase()));
}

function methodScoreMap(
  method: RetrievalMethod,
  solutions: readonly SolutionFixture[],
  keywordRanks: ReadonlyMap<string, number>,
  semanticRanks: ReadonlyMap<string, number>,
  hybridRanks: ReadonlyMap<string, number>,
  rerankerScores: ReadonlyMap<string, number>,
  eligibleIds: ReadonlySet<string>,
  fingerprintCounts: ReadonlyMap<string, number>,
) {
  const scores = new Map<string, number>();
  const fusionValues = solutions.map((solution) =>
    rrfScore(solution.id, keywordRanks, semanticRanks),
  );
  const maxFusion = Math.max(...fusionValues, 0);
  for (const [index, solution] of solutions.entries()) {
    const baseScore =
      method === "keyword"
        ? rankScore(keywordRanks.get(solution.id), solutions.length)
        : method === "embedding"
          ? rankScore(semanticRanks.get(solution.id), solutions.length)
          : method === "hybrid"
            ? rankScore(hybridRanks.get(solution.id), solutions.length)
            : method === "reranker"
              ? (rerankerScores.get(solution.id) ?? 0)
              : eligibleIds.has(solution.id)
                ? maxFusion === 0
                  ? 0
                  : fusionValues[index]! / maxFusion
                : 0;
    const fingerprintBoost =
      method === "structured"
        ? Math.min(fingerprintCounts.get(solution.id) ?? 0, 3) * FINGERPRINT_BOOST
        : 0;
    scores.set(solution.id, Math.min(1, Math.max(0, baseScore + fingerprintBoost)));
  }
  return scores;
}

function rankingForMethod(
  method: RetrievalMethod,
  solutions: readonly SolutionFixture[],
  keywordResults: readonly SolutionResult[],
  semanticResults: readonly SolutionResult[],
  hybridResults: readonly SolutionResult[],
  rerankerScores: ReadonlyMap<string, number>,
  eligibleIds: ReadonlySet<string>,
  fingerprintCounts: ReadonlyMap<string, number>,
) {
  const keywordRanks = rankMap(keywordResults);
  const semanticRanks = rankMap(semanticResults);
  const hybridRanks = rankMap(hybridResults);
  const scores = methodScoreMap(
    method,
    solutions,
    keywordRanks,
    semanticRanks,
    hybridRanks,
    rerankerScores,
    eligibleIds,
    fingerprintCounts,
  );
  const ranking = [...solutions]
    .filter((solution) => method !== "structured" || eligibleIds.has(solution.id))
    .sort((left, right) => {
      const scoreDelta = scores.get(right.id)! - scores.get(left.id)!;
      if (scoreDelta !== 0) return scoreDelta;
      return left.id.localeCompare(right.id);
    })
    .map((solution) => solution.id);
  return { ranking, scores, keywordRanks, semanticRanks, hybridRanks };
}

function buildTraces(
  retrievalCase: RetrievalCase,
  solutions: readonly SolutionFixture[],
  returnedIds: readonly string[],
  ranking: readonly string[],
  method: RetrievalMethod,
  keywordRanks: ReadonlyMap<string, number>,
  semanticRanks: ReadonlyMap<string, number>,
  fusionScores: ReadonlyMap<string, number>,
  rerankerScores: ReadonlyMap<string, number>,
  constraintsById: ReadonlyMap<string, ReturnType<typeof checkStructuredConstraints>>,
) {
  const returned = new Set(returnedIds);
  const traceIds = new Set([
    ...ranking.slice(0, 10),
    ...returnedIds,
    ...retrievalCase.dangerousDistractors.map((distractor) => distractor.solutionId),
    ...(method === "structured"
      ? solutions
          .filter(
            (solution) => (constraintsById.get(solution.id)?.rejectionReasons.length ?? 0) > 0,
          )
          .map((solution) => solution.id)
      : []),
  ]);
  return solutions
    .filter((solution) => traceIds.has(solution.id))
    .map((solution) => {
      const constraint = constraintsById.get(solution.id)!;
      const rejectionReasons = method === "structured" ? constraint.rejectionReasons : [];
      return {
        solutionId: solution.id,
        lexicalRank: keywordRanks.get(solution.id) ?? null,
        semanticRank: semanticRanks.get(solution.id) ?? null,
        fusionScore: fusionScores.get(solution.id) ?? null,
        rerankerScore: rerankerScores.get(solution.id) ?? null,
        matchedFingerprints: fingerprintMatches(retrievalCase, solution),
        constraintChecks: constraint.checks,
        status: solution.status,
        confidence: solution.confidence,
        relationshipEvidence: solution.relationships,
        selected: returned.has(solution.id),
        rejected: rejectionReasons.length > 0,
        rejectionReasons,
      } satisfies ExplanationTrace;
    });
}

export async function retrieveCase(
  index: BenchmarkIndex,
  retrievalCase: RetrievalCase,
  method: RetrievalMethod,
  options: RetrievalOptions,
): Promise<RawMethodResult> {
  const candidateLimit = index.solutions.length;
  const keywordResults = remapResults(
    index,
    await index.backend.search({
      query: keywordSafeQuery(retrievalCase.queryText),
      limit: candidateLimit,
      mode: "keyword",
    }),
  );
  const needsSemantic = method !== "keyword";
  const semanticResults = needsSemantic
    ? remapResults(
        index,
        await index.backend.search({
          query: retrievalCase.queryText,
          limit: candidateLimit,
          mode: "semantic",
        }),
      )
    : [];
  const hybridResults =
    method === "hybrid" || method === "reranker" || method === "structured"
      ? remapResults(
          index,
          await index.backend.search({
            query: keywordSafeQuery(retrievalCase.queryText),
            limit: candidateLimit,
            mode: "hybrid",
          }),
        )
      : semanticResults;

  const constraintsById = new Map(
    index.solutions.map((solution) => [
      solution.id,
      checkStructuredConstraints(solution, retrievalCase.requiredConstraints),
    ]),
  );
  const fingerprintCounts = new Map(
    index.solutions.map((solution) => [
      solution.id,
      fingerprintMatches(retrievalCase, solution).length,
    ]),
  );
  const eligibleIds = new Set(
    [...constraintsById.entries()].filter(([, result]) => result.eligible).map(([id]) => id),
  );
  const rerankerScores = new Map<string, number>();
  if (method === "reranker") {
    for (const solution of index.solutions) {
      rerankerScores.set(
        solution.id,
        await options.reranker.score({
          queryId: retrievalCase.id,
          solutionId: solution.id,
          queryText: retrievalCase.queryText,
          solutionText: rerankerInput(solution),
        }),
      );
    }
  }

  const ranked = rankingForMethod(
    method,
    index.solutions,
    keywordResults,
    semanticResults,
    hybridResults,
    rerankerScores,
    eligibleIds,
    fingerprintCounts,
  );
  const keywordRanks = ranked.keywordRanks;
  const semanticRanks = ranked.semanticRanks;
  const fusionScores = new Map(
    index.solutions.map((solution) => {
      const raw = rrfScore(solution.id, keywordRanks, semanticRanks);
      const max = Math.max(
        ...index.solutions.map((item) => rrfScore(item.id, keywordRanks, semanticRanks)),
        0,
      );
      return [solution.id, max === 0 ? 0 : raw / max] as const;
    }),
  );
  const traces = buildTraces(
    retrievalCase,
    index.solutions,
    [],
    ranked.ranking,
    method,
    keywordRanks,
    semanticRanks,
    fusionScores,
    rerankerScores,
    constraintsById,
  );
  return { method, ranking: ranked.ranking, scores: ranked.scores, traces };
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

export function buildReranker(options: {
  cacheDir: string;
  offline: boolean;
  mode: "fixture" | "transformers";
  fixturePath?: string;
}) {
  return createReranker(options);
}

export function resultForCase(
  raw: RawMethodResult,
  retrievalCase: RetrievalCase,
  threshold: number,
): MethodQueryResult {
  const result = finalizeMethodQueryResult(raw, threshold);
  return { ...result, queryId: retrievalCase.id };
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

export function normalizeScore(score: number, min = 0, max = 1) {
  if (!Number.isFinite(score)) return 0;
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (score - min) / (max - min)));
}
