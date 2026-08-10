export const STRATA = [
  "javascript-tooling",
  "web-auth-ssr",
  "databases",
  "cloud-runtimes",
  "python-ml-tooling",
  "ci-os-devtools",
] as const;

export type Stratum = (typeof STRATA)[number];

export const CASE_CATEGORIES = [
  "direct-reuse",
  "related-adaptation",
  "lexical-irrelevant",
  "different-version",
  "same-error-different-root-cause",
  "stale-or-reverted",
  "no-useful-memory",
] as const;

export type CaseCategory = (typeof CASE_CATEGORIES)[number];
export type Split = "development" | "test";
export type ReuseSafety = "safe" | "adapt" | "unsafe" | "none";
export type MemoryKind = "solution" | "plan";
export type MemoryStatus = "active" | "superseded" | "reverted" | "disputed" | "rejected";
export type ConfidenceClass = "high" | "medium" | "low";
export type RelationshipType =
  | "related_to"
  | "adapts"
  | "supersedes"
  | "reverts"
  | "conflicts_with";

export type EnvironmentConstraints = {
  repository: string;
  commitRange: string;
  dependencyVersions: Record<string, string>;
  runtime: string;
  toolchain: string;
  packageManager: string;
  os: string;
  architecture: string;
  platforms: string[];
  rootCauseKey: string;
};

export type Provenance = {
  source: "sanitized-real-world-pattern" | "controlled-adversarial-variant";
  sourceRef: string;
  capturedAt: string;
  evidence: string[];
};

export type Relationship = {
  type: RelationshipType;
  targetId: string;
  evidence: string;
};

export type SolutionFixture = {
  id: string;
  familyId: string;
  title: string;
  problem: string;
  rootCause: string;
  solution: string;
  verificationEvidence: string[];
  memoryKind: MemoryKind;
  status: MemoryStatus;
  confidence: ConfidenceClass;
  usefulnessVotes: number;
  constraints: EnvironmentConstraints;
  provenance: Provenance;
  relationships: Relationship[];
  fingerprints: string[];
  importantFiles: string[];
  commands: string[];
  errorStrings: string[];
  tags: string[];
};

export type RequiredConstraints = {
  repository: string;
  dependencyVersions: Record<string, string>;
  runtime: string;
  toolchain: string;
  packageManager: string;
  os: string;
  architecture: string;
  platforms: string[];
  rootCauseKey?: string;
};

export type DangerousDistractor = {
  solutionId: string;
  rejectionReason: string;
};

export type RetrievalCase = {
  id: string;
  familyId: string;
  stratum: Stratum;
  category: CaseCategory;
  split: Split;
  queryText: string;
  relevantSolutionIds: string[];
  reuseSafety: ReuseSafety;
  requiredConstraints: RequiredConstraints;
  importantFiles: string[];
  commands: string[];
  errorStrings: string[];
  dangerousDistractors: DangerousDistractor[];
  noUsefulMemory: boolean;
};

export type FixFamily = {
  id: string;
  stratum: Stratum;
  title: string;
  packageName: string;
  versions: Record<string, string>;
  runtime: string;
  toolchain: string;
  packageManager: string;
  os: string;
  architecture: string;
  platforms: string[];
  commitRange: string;
  problem: string;
  rootCause: string;
  rootCauseKey: string;
  solution: string;
  verification: string[];
  fingerprints: string[];
  files: string[];
  commands: string[];
  errors: string[];
  tags: string[];
  alternateRootCause: {
    key: string;
    problem: string;
    rootCause: string;
    solution: string;
    verification: string[];
    fingerprints: string[];
  };
  noUsefulQuery: {
    problem: string;
    error: string;
  };
};

export type BenchmarkDataset = {
  version: 1;
  families: FixFamily[];
  solutions: SolutionFixture[];
  cases: RetrievalCase[];
};

export type RetrievalMethod = "keyword";

export const RETRIEVAL_METHODS: RetrievalMethod[] = ["keyword"];

export type ConstraintCheck = {
  name: string;
  status: "pass" | "fail" | "unknown";
  detail: string;
};

export type ExplanationTrace = {
  solutionId: string;
  lexicalRank: number | null;
  matchedFingerprints: string[];
  constraintChecks: ConstraintCheck[];
  status: MemoryStatus;
  confidence: ConfidenceClass;
  relationshipEvidence: Relationship[];
  selected: boolean;
  rejected: boolean;
  rejectionReasons: string[];
};

export type MethodQueryResult = {
  queryId: string;
  rawRanking: string[];
  returnedIds: string[];
  abstained: boolean;
  topScore: number;
  explanationTrace: ExplanationTrace[];
};

export type ThresholdCalibration = {
  method: RetrievalMethod;
  threshold: number;
  developmentF1: number;
  developmentNoUsefulAccuracy: number;
  tunedOnSplit: "development";
};

export type MetricWithInterval = {
  value: number;
  low: number;
  high: number;
};

export type RetrievalMetrics = {
  positiveCases: number;
  ndcg10: MetricWithInterval;
  mrr10: MetricWithInterval;
  recall1: MetricWithInterval;
  recall3: MetricWithInterval;
  recall10: MetricWithInterval;
  safeReusePrecisionAt1: MetricWithInterval;
  abstentionPrecision: MetricWithInterval;
  abstentionRecall: MetricWithInterval;
  abstentionF1: MetricWithInterval;
  noUsefulMemoryAccuracy: MetricWithInterval;
  unsafeReturnRate: MetricWithInterval;
  staleFixRate: MetricWithInterval;
  wrongVersionRate: MetricWithInterval;
  wrongRootCauseRate: MetricWithInterval;
  constraintViolationRate: MetricWithInterval;
};

export type LatencySummary = {
  coldStartMs: number;
  warmMedianMs: number;
  warmP95Ms: number;
};

export type MethodRun = {
  method: RetrievalMethod;
  split: Split;
  candidatePoolSize: number;
  latency: LatencySummary;
  implementation: "LocalBackend SQLite FTS5 tiered keyword search";
  calibration: ThresholdCalibration;
  metrics: RetrievalMetrics;
  categoryMetrics: Record<CaseCategory, RetrievalMetrics>;
  queries: MethodQueryResult[];
};

export type BenchmarkRun = {
  benchmark: "ClankerOverflow Memory Retrieval Benchmark";
  version: 1;
  split: "development" | "test" | "all";
  dataset: {
    families: number;
    solutions: number;
    cases: number;
    developmentCases: number;
    testCases: number;
    casesPerCategory: Record<CaseCategory, number>;
    repeatabilityFingerprint: string;
  };
  thresholds: ThresholdCalibration[];
  methods: MethodRun[];
  warnings: string[];
  artifacts: {
    jsonPath?: string;
    markdownPath?: string;
  };
};
