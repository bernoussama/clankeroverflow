import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { LocalDb } from "../mcp/local-db";
import { openLocalDb } from "../mcp/local-db";
import {
  searchLocalKeyword,
  searchLocalKeywordExact,
  type FtsQuerySyntaxError,
} from "../mcp/local-backend";
import { createSolutionBackend } from "../mcp/create-backend";
import { resolveConfig } from "../mcp/config";
import { searchWithAutoFallback } from "../mcp/auto-search";

export type PolicyLabel = "must_search" | "must_not_search" | "allowed_search";
export type RunConfig =
  | "with_mcp_known_fix"
  | "with_mcp_empty_db"
  | "without_mcp"
  | "learn_then_reuse_pass1"
  | "learn_then_reuse_pass2";
export type PairwiseWinner = "with_mcp_win" | "tie" | "without_mcp_win" | "pending";
export type DifficultyLabel =
  | "hard_debugging"
  | "integration_gotcha"
  | "routine"
  | "conceptual"
  | "preference";
export type ExpectedBehavior = "search" | "skip" | "optional_search" | "search_then_log";
export type TaskType = "answer_only" | "debug_workspace";

export type FixtureSolution = {
  id: string;
  problem: string;
  solution: string;
  tags: string[];
};

export type Scenario = {
  id: string;
  title: string;
  category: string;
  task_type?: TaskType;
  policy_label: PolicyLabel;
  difficulty_label?: DifficultyLabel;
  expected_behavior?: ExpectedBehavior;
  solution_leverage: boolean;
  learned_reuse?: boolean;
  cost_claim_eligible?: boolean;
  prompt: string;
  workspace_fixture?: string;
  agent_verification_command?: string;
  verification_command?: string;
  expected_changed_files?: string[];
  fixture_solution_ids: string[];
  acceptable_query_fingerprints: string[];
  expected_key_facts: string[];
  rubric_notes: string;
};

export type ToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
  result_ids?: string[];
  logged_ids?: string[];
};

export type HumanReview = {
  correctness: number;
  usefulness: number;
  specificity: number;
  safety: number;
  rationale?: string;
};

export type EvalRun = {
  scenario_id: string;
  config: RunConfig;
  repetition: number;
  status?: "completed" | "failed";
  error?: string;
  usage?: RunUsage;
  cost_estimate?: CostEstimate | null;
  transcript?: string;
  tool_calls?: ToolCall[];
  search_query?: string | null;
  returned_solution_ids?: string[];
  logged_solution_ids?: string[];
  workspace_path?: string;
  verification_command?: string;
  verification_passed?: boolean;
  verification_stdout?: string;
  verification_stderr?: string;
  changed_files?: string[];
  final_answer: string;
  human_review?: HumanReview;
};

export type RunUsage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_provider_tokens: number;
  elapsed_ms: number;
};

export type PricingRate = {
  input_per_1m: number;
  cached_input_per_1m: number;
  output_per_1m: number;
  reasoning_output_per_1m: number;
};

export type PricingConfig = Record<string, PricingRate>;

export type CostEstimate = {
  model: string;
  input_usd: number;
  cached_input_usd: number;
  output_usd: number;
  reasoning_output_usd: number;
  total_usd: number;
};

export type PairwiseReview = {
  scenario_id: string;
  repetition: number;
  winner: PairwiseWinner;
  rationale: string;
};

export type RunsFile = {
  metadata?: {
    name?: string;
    sample?: boolean;
    agent?: string;
    model?: string;
    created_at?: string;
    notes?: string;
  };
  runs: EvalRun[];
  pairwise_reviews?: PairwiseReview[];
};

export type BenchmarkInput = {
  workspaceDir: string;
  scenarios: Scenario[];
  fixtures: FixtureSolution[];
  runFiles: Array<{ path: string; data: RunsFile }>;
};

export type RunGrade = {
  scenarioId: string;
  config: RunConfig;
  repetition: number;
  policyLabel: PolicyLabel;
  searched: boolean;
  triggerPass: boolean | null;
  query: string | null;
  queryConcisePass: boolean | null;
  queryMatchPass: boolean | null;
  retrievalPass: boolean | null;
  logPass: boolean | null;
  returnedSolutionIds: string[];
  loggedSolutionIds: string[];
  expectedFactHits: string[];
  expectedFactTotal: number;
  expectedFactRate: number;
  humanScore: number | null;
  unsafeCopying: boolean;
  runFailed: boolean;
  verificationPassed: boolean | null;
  changedFiles: string[];
  usage: RunUsage | null;
  costEstimate: CostEstimate | null;
};

export type PairGrade = {
  scenarioId: string;
  repetition: number;
  winner: PairwiseWinner;
  rationale: string;
  source: "human_review" | "score_delta" | "pending";
};

export type FixturePreflight = {
  scenarioId: string;
  fingerprint: string;
  expectedSolutionIds: string[];
  exactResultIds: string[];
  tieredResultIds: string[];
  passed: boolean;
  usedFallback: boolean;
  error?: string;
};

export type SummaryMetric = {
  passed: number;
  total: number;
  rate: number | null;
};

export type DeltaMetric = {
  median: number | null;
  samples: number;
};

export type BenchmarkSummary = {
  scenarioCount: number;
  fixtureCount: number;
  runCount: number;
  failedRunCount: number;
  sampleRunCount: number;
  realRunCount: number;
  policyCounts: Record<PolicyLabel, number>;
  knownFixTriggerRecall: SummaryMetric;
  knownFixRetrievalRate: SummaryMetric;
  learnedReusePassRate: SummaryMetric;
  medianTokenSavingsKnownVsEmpty: DeltaMetric;
  medianTokenSavingsKnownVsNoMcp: DeltaMetric;
  medianCostSavingsKnownVsEmpty: DeltaMetric;
  medianCostSavingsKnownVsNoMcp: DeltaMetric;
  medianElapsedSavingsKnownVsEmpty: DeltaMetric;
  medianElapsedSavingsKnownVsNoMcp: DeltaMetric;
  debugSolvedPairCount: number;
  debugMedianTokenSavingsKnownVsNoMcp: DeltaMetric;
  debugMedianCostSavingsKnownVsNoMcp: DeltaMetric;
  debugMedianElapsedSavingsKnownVsNoMcp: DeltaMetric;
  debugMedianTokenSavingsRateKnownVsNoMcp: DeltaMetric;
  debugMedianCostSavingsRateKnownVsNoMcp: DeltaMetric;
  debugMedianElapsedSavingsRateKnownVsNoMcp: DeltaMetric;
  mustSearchRecall: SummaryMetric;
  mustNotSearchPrecision: SummaryMetric;
  usefulRetrievalRate: SummaryMetric;
  mcpWinRate: SummaryMetric;
  decisiveMcpWinRate: SummaryMetric;
  unsafeCopyingRate: SummaryMetric;
  fixturePreflight: SummaryMetric;
  allowedSearchNotes: Array<{ scenarioId: string; searched: boolean; rationale: string }>;
};

export type BenchmarkAnalysis = {
  runGrades: RunGrade[];
  pairGrades: PairGrade[];
  fixturePreflight: FixturePreflight[];
  hostedSmoke?: HostedSmokeResult;
  summary: BenchmarkSummary;
};

export type HostedSmokeResult = {
  query: string;
  source: "remote";
  ok: boolean;
  resultCount: number;
  attempts: string[];
  error?: string;
};

type CliOptions = {
  workspaceDir: string;
  runsPath?: string;
  reportPath: string;
  summaryPath: string;
  pricingConfigPath?: string;
  includeSampleRuns: boolean;
  hostedSmoke: boolean;
  hostedSmokeQuery: string;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function rate(passed: number, total: number): SummaryMetric {
  return { passed, total, rate: total === 0 ? null : passed / total };
}

function median(values: number[]): DeltaMetric {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { median: null, samples: 0 };
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  return { median: value, samples: sorted.length };
}

function defaultExpectedBehavior(scenario: Scenario): ExpectedBehavior {
  if (scenario.expected_behavior) return scenario.expected_behavior;
  if (scenario.policy_label === "must_search") return "search";
  if (scenario.policy_label === "must_not_search") return "skip";
  return "optional_search";
}

function isMcpConfig(config: RunConfig) {
  return config !== "without_mcp";
}

function isKnownFixConfig(config: RunConfig) {
  return config === "with_mcp_known_fix";
}

function isDebugWorkspaceScenario(scenario: Scenario) {
  return scenario.task_type === "debug_workspace";
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_*:$.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function searchQueryFromRun(run: EvalRun): string | null {
  if (typeof run.search_query === "string" && run.search_query.trim()) {
    return run.search_query.trim();
  }
  const searchCall = run.tool_calls?.find((call) => call.name === "search_solutions");
  const query = searchCall?.arguments?.query;
  return typeof query === "string" && query.trim() ? query.trim() : null;
}

function returnedIdsFromRun(run: EvalRun) {
  const ids = new Set(run.returned_solution_ids ?? []);
  for (const call of run.tool_calls ?? []) {
    for (const id of call.result_ids ?? []) ids.add(id);
  }
  return [...ids];
}

function loggedIdsFromRun(run: EvalRun) {
  const ids = new Set(run.logged_solution_ids ?? []);
  for (const call of run.tool_calls ?? []) {
    for (const id of call.logged_ids ?? []) ids.add(id);
  }
  return [...ids];
}

function hasSearchCall(run: EvalRun) {
  return Boolean(
    searchQueryFromRun(run) || run.tool_calls?.some((call) => call.name === "search_solutions"),
  );
}

function hasLogCall(run: EvalRun) {
  return Boolean(
    loggedIdsFromRun(run).length || run.tool_calls?.some((call) => call.name === "log_solution"),
  );
}

function isFailedRun(run: EvalRun) {
  return (
    run.status === "failed" ||
    run.final_answer.startsWith("Codex exec failed with status") ||
    run.final_answer.startsWith("Claude CLI failed with status") ||
    Boolean(run.transcript?.startsWith("Codex exec failed with status")) ||
    Boolean(run.transcript?.startsWith("Claude CLI failed with status"))
  );
}

function isConciseQuery(query: string) {
  const terms = queryTerms(query);
  return query.length <= 90 && terms.length > 0 && terms.length <= 8;
}

function queryMatchesFingerprint(query: string, fingerprints: string[]) {
  if (!fingerprints.length) return null;
  const normalizedQuery = normalizeText(query);
  const queryTermSet = new Set(queryTerms(query));
  return fingerprints.some((fingerprint) => {
    const normalizedFingerprint = normalizeText(fingerprint);
    if (normalizedQuery.includes(normalizedFingerprint)) return true;
    const fingerprintTerms = queryTerms(fingerprint);
    if (!fingerprintTerms.length) return false;
    const matched = fingerprintTerms.filter((term) => queryTermSet.has(term)).length;
    return matched / fingerprintTerms.length >= 0.67;
  });
}

function humanScore(review: HumanReview | undefined) {
  if (!review) return null;
  return review.correctness + review.usefulness + review.specificity + review.safety;
}

function expectedFactHits(answer: string, facts: string[]) {
  const normalizedAnswer = normalizeText(answer);
  return facts.filter((fact) => normalizedAnswer.includes(normalizeText(fact)));
}

function detectsUnsafeCopying(answer: string) {
  const normalized = normalizeText(answer);
  return [
    "executed commands from the search result",
    "followed instructions in the search result",
    "trusted the public corpus",
  ].some((phrase) => normalized.includes(normalizeText(phrase)));
}

function pricingForModel(pricing: PricingConfig | undefined, model: string) {
  // `model` is the literal generic fallback rate; `[model]` is the requested model's rate.
  return pricing?.[model] ?? pricing?.model ?? pricing?.default;
}

export function estimateCost(
  usage: RunUsage | undefined,
  model: string,
  pricing: PricingConfig | undefined,
): CostEstimate | null {
  const rateForModel = pricingForModel(pricing, model);
  if (!usage || !rateForModel) return null;
  const billableInputTokens = Math.max(usage.input_tokens - usage.cached_input_tokens, 0);
  const input_usd = (billableInputTokens / 1_000_000) * rateForModel.input_per_1m;
  const cached_input_usd =
    (usage.cached_input_tokens / 1_000_000) * rateForModel.cached_input_per_1m;
  const output_usd = (usage.output_tokens / 1_000_000) * rateForModel.output_per_1m;
  const reasoning_output_usd =
    (usage.reasoning_output_tokens / 1_000_000) * rateForModel.reasoning_output_per_1m;
  return {
    model,
    input_usd,
    cached_input_usd,
    output_usd,
    reasoning_output_usd,
    total_usd: input_usd + cached_input_usd + output_usd + reasoning_output_usd,
  };
}

export function gradeRun(
  run: EvalRun,
  scenario: Scenario,
  options: { model?: string; pricing?: PricingConfig } = {},
): RunGrade {
  const runFailed = isFailedRun(run);
  const searched = hasSearchCall(run);
  const logged = hasLogCall(run);
  const query = searchQueryFromRun(run);
  const returnedSolutionIds = returnedIdsFromRun(run);
  const loggedSolutionIds = loggedIdsFromRun(run);
  const expectedReturnedIds = scenario.fixture_solution_ids;
  const factHits = expectedFactHits(run.final_answer, scenario.expected_key_facts);
  const expectedBehavior = defaultExpectedBehavior(scenario);
  const usage = run.usage ?? null;
  const verificationPassed =
    scenario.task_type === "debug_workspace" ? Boolean(run.verification_passed) : null;
  const costEstimate =
    run.cost_estimate ??
    estimateCost(usage ?? undefined, options.model ?? "configured-default", options.pricing);

  const triggerPass =
    expectedBehavior === "optional_search"
      ? null
      : expectedBehavior === "search" || expectedBehavior === "search_then_log"
        ? searched
        : !searched;
  const retrievalPass =
    expectedReturnedIds.length === 0
      ? null
      : searched && (isKnownFixConfig(run.config) || run.config === "learn_then_reuse_pass2")
        ? expectedReturnedIds.some((id) => returnedSolutionIds.includes(id))
        : run.config === "with_mcp_empty_db" || run.config === "learn_then_reuse_pass1"
          ? !expectedReturnedIds.some((id) => returnedSolutionIds.includes(id))
          : false;
  const logPass = run.config === "learn_then_reuse_pass1" ? searched && logged : null;

  return {
    scenarioId: scenario.id,
    config: run.config,
    repetition: run.repetition,
    policyLabel: scenario.policy_label,
    searched,
    triggerPass,
    query,
    queryConcisePass: query ? isConciseQuery(query) : null,
    queryMatchPass: query
      ? queryMatchesFingerprint(query, scenario.acceptable_query_fingerprints)
      : null,
    retrievalPass,
    logPass,
    returnedSolutionIds,
    loggedSolutionIds,
    expectedFactHits: factHits,
    expectedFactTotal: scenario.expected_key_facts.length,
    expectedFactRate:
      scenario.expected_key_facts.length === 0
        ? 1
        : factHits.length / scenario.expected_key_facts.length,
    humanScore: humanScore(run.human_review),
    unsafeCopying: detectsUnsafeCopying(run.final_answer),
    runFailed,
    verificationPassed,
    changedFiles: run.changed_files ?? [],
    usage,
    costEstimate,
  };
}

function pairKey(scenarioId: string, repetition: number) {
  return `${scenarioId}#${repetition}`;
}

export function gradePairs(input: BenchmarkInput, runGrades: RunGrade[]): PairGrade[] {
  const explicitReviews = new Map<string, PairwiseReview>();
  for (const file of input.runFiles) {
    for (const review of file.data.pairwise_reviews ?? []) {
      explicitReviews.set(pairKey(review.scenario_id, review.repetition), review);
    }
  }

  const grouped = new Map<string, RunGrade[]>();
  for (const grade of runGrades) {
    const key = pairKey(grade.scenarioId, grade.repetition);
    grouped.set(key, [...(grouped.get(key) ?? []), grade]);
  }

  return [...grouped.entries()]
    .map(([key, grades]) => {
      const explicit = explicitReviews.get(key);
      if (explicit) {
        return {
          scenarioId: explicit.scenario_id,
          repetition: explicit.repetition,
          winner: explicit.winner,
          rationale: explicit.rationale,
          source: "human_review" as const,
        };
      }

      const withMcp = grades.find((grade) => grade.config === "with_mcp_known_fix");
      const withoutMcp = grades.find((grade) => grade.config === "without_mcp");
      if (
        !withMcp ||
        !withoutMcp ||
        withMcp.humanScore === null ||
        withoutMcp.humanScore === null
      ) {
        return {
          scenarioId: grades[0]?.scenarioId ?? key,
          repetition: grades[0]?.repetition ?? 0,
          winner: "pending" as const,
          rationale: "No pairwise human review or comparable human scores were recorded.",
          source: "pending" as const,
        };
      }
      const delta = withMcp.humanScore - withoutMcp.humanScore;
      const winner: PairwiseWinner =
        Math.abs(delta) < 2 ? "tie" : delta > 0 ? "with_mcp_win" : "without_mcp_win";
      return {
        scenarioId: withMcp.scenarioId,
        repetition: withMcp.repetition,
        winner,
        rationale: `Derived from human score delta (${withMcp.humanScore} vs ${withoutMcp.humanScore}).`,
        source: "score_delta" as const,
      };
    })
    .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId) || a.repetition - b.repetition);
}

export function seedFixtureDb(db: LocalDb, fixtures: FixtureSolution[]) {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const insertSolution = db.prepare(
    `INSERT INTO solution (id, problem, solution, tags, score, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  );
  const insertFts = db.prepare(
    `INSERT INTO solution_fts (rowid, problem, solution, tags)
     VALUES (?, ?, ?, ?)`,
  );
  const insert = db.transaction(() => {
    for (const fixture of fixtures) {
      const tags = fixture.tags.join(",");
      const info = insertSolution.run(
        fixture.id,
        fixture.problem,
        fixture.solution,
        tags,
        timestamp,
        timestamp,
      );
      insertFts.run(info.lastInsertRowid, fixture.problem, fixture.solution, tags);
    }
  });
  insert.immediate();
}

export function validateFixtureRetrieval(input: Pick<BenchmarkInput, "scenarios" | "fixtures">) {
  const dir = mkdtempSync(join(tmpdir(), "clanker-product-proof-"));
  const dbPath = join(dir, "fixtures.sqlite");
  const db = openLocalDb(dbPath);
  try {
    seedFixtureDb(db, input.fixtures);
    const rows: FixturePreflight[] = [];
    for (const scenario of input.scenarios) {
      if (!scenario.fixture_solution_ids.length) continue;
      for (const fingerprint of scenario.acceptable_query_fingerprints) {
        try {
          const exactResultIds = searchLocalKeywordExact(db, fingerprint, 5).map(
            (result) => result.id,
          );
          const tieredResultIds = searchLocalKeyword(db, fingerprint, 5).map((result) => result.id);
          const passed = scenario.fixture_solution_ids.some((id) => tieredResultIds.includes(id));
          rows.push({
            scenarioId: scenario.id,
            fingerprint,
            expectedSolutionIds: scenario.fixture_solution_ids,
            exactResultIds,
            tieredResultIds,
            passed,
            usedFallback:
              passed && !scenario.fixture_solution_ids.some((id) => exactResultIds.includes(id)),
          });
        } catch (error) {
          rows.push({
            scenarioId: scenario.id,
            fingerprint,
            expectedSolutionIds: scenario.fixture_solution_ids,
            exactResultIds: [],
            tieredResultIds: [],
            passed: false,
            usedFallback: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return rows;
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function loadRunsFromPath(path: string) {
  const statPath = resolve(path);
  if (statPath.endsWith(".json")) {
    return [{ path: statPath, data: readJson<RunsFile>(statPath) }];
  }
  return readdirSync(statPath)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => {
      const fullPath = join(statPath, entry);
      return { path: fullPath, data: readJson<RunsFile>(fullPath) };
    });
}

export function loadBenchmarkInput(options: {
  workspaceDir: string;
  runsPath?: string;
  includeSampleRuns?: boolean;
}): BenchmarkInput {
  const workspaceDir = resolve(options.workspaceDir);
  const scenarios = readJson<Scenario[]>(join(workspaceDir, "scenarios.json"));
  const fixtures = readJson<FixtureSolution[]>(join(workspaceDir, "fixtures.json"));
  const runsPath = options.runsPath ? resolve(options.runsPath) : join(workspaceDir, "runs");
  const runFiles = loadRunsFromPath(runsPath).filter(
    (file) => options.includeSampleRuns !== false || !file.data.metadata?.sample,
  );
  return { workspaceDir, scenarios, fixtures, runFiles };
}

function summarize(
  input: BenchmarkInput,
  runGrades: RunGrade[],
  pairGrades: PairGrade[],
  preflight: FixturePreflight[],
) {
  const completedGrades = runGrades.filter((grade) => !grade.runFailed);
  const withMcp = completedGrades.filter((grade) => isMcpConfig(grade.config));
  const knownFix = withMcp.filter((grade) => grade.config === "with_mcp_known_fix");
  const mustSearch = knownFix.filter((grade) => grade.policyLabel === "must_search");
  const allMustSearch = withMcp.filter((grade) => grade.policyLabel === "must_search");
  const mustNotSearch = withMcp.filter((grade) => grade.policyLabel === "must_not_search");
  const knownRetrievalGrades = knownFix.filter((grade) => grade.retrievalPass !== null);
  const reviewedPairs = pairGrades.filter((pair) => pair.winner !== "pending");
  const decisivePairs = reviewedPairs.filter((pair) => pair.winner !== "tie");
  const scenarioById = new Map(input.scenarios.map((scenario) => [scenario.id, scenario]));
  const sampleRunCount = input.runFiles.reduce(
    (count, file) => count + (file.data.metadata?.sample ? file.data.runs.length : 0),
    0,
  );
  const policyCounts = {
    must_search: input.scenarios.filter((scenario) => scenario.policy_label === "must_search")
      .length,
    must_not_search: input.scenarios.filter(
      (scenario) => scenario.policy_label === "must_not_search",
    ).length,
    allowed_search: input.scenarios.filter((scenario) => scenario.policy_label === "allowed_search")
      .length,
  };
  const savingsGroups = new Map<string, RunGrade[]>();
  for (const grade of completedGrades) {
    const scenario = scenarioById.get(grade.scenarioId);
    if (!scenario?.cost_claim_eligible || !grade.usage) continue;
    const key = pairKey(grade.scenarioId, grade.repetition);
    savingsGroups.set(key, [...(savingsGroups.get(key) ?? []), grade]);
  }
  const tokenSavingsKnownVsEmpty: number[] = [];
  const tokenSavingsKnownVsNoMcp: number[] = [];
  const costSavingsKnownVsEmpty: number[] = [];
  const costSavingsKnownVsNoMcp: number[] = [];
  const elapsedSavingsKnownVsEmpty: number[] = [];
  const elapsedSavingsKnownVsNoMcp: number[] = [];
  const debugTokenSavingsKnownVsNoMcp: number[] = [];
  const debugCostSavingsKnownVsNoMcp: number[] = [];
  const debugElapsedSavingsKnownVsNoMcp: number[] = [];
  const debugTokenSavingsRateKnownVsNoMcp: number[] = [];
  const debugCostSavingsRateKnownVsNoMcp: number[] = [];
  const debugElapsedSavingsRateKnownVsNoMcp: number[] = [];
  for (const grades of savingsGroups.values()) {
    const known = grades.find((grade) => grade.config === "with_mcp_known_fix");
    const empty = grades.find((grade) => grade.config === "with_mcp_empty_db");
    const noMcp = grades.find((grade) => grade.config === "without_mcp");
    const scenario = known ? scenarioById.get(known.scenarioId) : undefined;
    const knownSolved =
      !isDebugWorkspaceScenario(scenario ?? ({} as Scenario)) || known?.verificationPassed === true;
    const noMcpSolved =
      !isDebugWorkspaceScenario(scenario ?? ({} as Scenario)) || noMcp?.verificationPassed === true;
    if (known?.usage && empty?.usage) {
      tokenSavingsKnownVsEmpty.push(
        empty.usage.total_provider_tokens - known.usage.total_provider_tokens,
      );
      elapsedSavingsKnownVsEmpty.push(empty.usage.elapsed_ms - known.usage.elapsed_ms);
    }
    if (known?.costEstimate && empty?.costEstimate) {
      costSavingsKnownVsEmpty.push(empty.costEstimate.total_usd - known.costEstimate.total_usd);
    }
    if (known?.usage && noMcp?.usage) {
      tokenSavingsKnownVsNoMcp.push(
        noMcp.usage.total_provider_tokens - known.usage.total_provider_tokens,
      );
      elapsedSavingsKnownVsNoMcp.push(noMcp.usage.elapsed_ms - known.usage.elapsed_ms);
    }
    if (known?.costEstimate && noMcp?.costEstimate) {
      costSavingsKnownVsNoMcp.push(noMcp.costEstimate.total_usd - known.costEstimate.total_usd);
    }
    if (
      scenario &&
      isDebugWorkspaceScenario(scenario) &&
      known?.usage &&
      noMcp?.usage &&
      knownSolved &&
      noMcpSolved
    ) {
      const tokenDelta = noMcp.usage.total_provider_tokens - known.usage.total_provider_tokens;
      const elapsedDelta = noMcp.usage.elapsed_ms - known.usage.elapsed_ms;
      debugTokenSavingsKnownVsNoMcp.push(tokenDelta);
      debugElapsedSavingsKnownVsNoMcp.push(elapsedDelta);
      debugTokenSavingsRateKnownVsNoMcp.push(tokenDelta / noMcp.usage.total_provider_tokens);
      debugElapsedSavingsRateKnownVsNoMcp.push(elapsedDelta / noMcp.usage.elapsed_ms);
      if (known.costEstimate && noMcp.costEstimate) {
        const costDelta = noMcp.costEstimate.total_usd - known.costEstimate.total_usd;
        debugCostSavingsKnownVsNoMcp.push(costDelta);
        debugCostSavingsRateKnownVsNoMcp.push(costDelta / noMcp.costEstimate.total_usd);
      }
    }
  }

  const learnedGroups = new Map<string, RunGrade[]>();
  for (const grade of completedGrades) {
    const scenario = scenarioById.get(grade.scenarioId);
    if (!scenario?.learned_reuse) continue;
    if (grade.config !== "learn_then_reuse_pass1" && grade.config !== "learn_then_reuse_pass2") {
      continue;
    }
    const key = pairKey(grade.scenarioId, grade.repetition);
    learnedGroups.set(key, [...(learnedGroups.get(key) ?? []), grade]);
  }
  const learnedPasses = [...learnedGroups.values()].filter((grades) => {
    const pass1 = grades.find((grade) => grade.config === "learn_then_reuse_pass1");
    const pass2 = grades.find((grade) => grade.config === "learn_then_reuse_pass2");
    if (!pass1 || !pass2 || !pass1.loggedSolutionIds.length) return false;
    const retrievedLogged = pass1.loggedSolutionIds.some((id) =>
      pass2.returnedSolutionIds.includes(id),
    );
    return Boolean(
      pass1.triggerPass &&
      pass1.logPass &&
      pass2.triggerPass &&
      retrievedLogged &&
      pass2.expectedFactRate >= 0.5,
    );
  }).length;

  return {
    scenarioCount: input.scenarios.length,
    fixtureCount: input.fixtures.length,
    runCount: runGrades.length,
    failedRunCount: runGrades.filter((grade) => grade.runFailed).length,
    sampleRunCount,
    realRunCount: runGrades.length - sampleRunCount,
    policyCounts,
    knownFixTriggerRecall: rate(
      mustSearch.filter((grade) => grade.searched).length,
      mustSearch.length,
    ),
    knownFixRetrievalRate: rate(
      knownRetrievalGrades.filter((grade) => grade.retrievalPass).length,
      knownRetrievalGrades.length,
    ),
    learnedReusePassRate: rate(learnedPasses, learnedGroups.size),
    medianTokenSavingsKnownVsEmpty: median(tokenSavingsKnownVsEmpty),
    medianTokenSavingsKnownVsNoMcp: median(tokenSavingsKnownVsNoMcp),
    medianCostSavingsKnownVsEmpty: median(costSavingsKnownVsEmpty),
    medianCostSavingsKnownVsNoMcp: median(costSavingsKnownVsNoMcp),
    medianElapsedSavingsKnownVsEmpty: median(elapsedSavingsKnownVsEmpty),
    medianElapsedSavingsKnownVsNoMcp: median(elapsedSavingsKnownVsNoMcp),
    debugSolvedPairCount: debugTokenSavingsKnownVsNoMcp.length,
    debugMedianTokenSavingsKnownVsNoMcp: median(debugTokenSavingsKnownVsNoMcp),
    debugMedianCostSavingsKnownVsNoMcp: median(debugCostSavingsKnownVsNoMcp),
    debugMedianElapsedSavingsKnownVsNoMcp: median(debugElapsedSavingsKnownVsNoMcp),
    debugMedianTokenSavingsRateKnownVsNoMcp: median(debugTokenSavingsRateKnownVsNoMcp),
    debugMedianCostSavingsRateKnownVsNoMcp: median(debugCostSavingsRateKnownVsNoMcp),
    debugMedianElapsedSavingsRateKnownVsNoMcp: median(debugElapsedSavingsRateKnownVsNoMcp),
    mustSearchRecall: rate(
      allMustSearch.filter((grade) => grade.searched).length,
      allMustSearch.length,
    ),
    mustNotSearchPrecision: rate(
      mustNotSearch.filter((grade) => !grade.searched).length,
      mustNotSearch.length,
    ),
    usefulRetrievalRate: rate(
      withMcp.filter((grade) => grade.retrievalPass === true).length,
      withMcp.filter((grade) => grade.retrievalPass !== null).length,
    ),
    mcpWinRate: rate(
      reviewedPairs.filter((pair) => pair.winner === "with_mcp_win").length,
      reviewedPairs.length,
    ),
    decisiveMcpWinRate: rate(
      decisivePairs.filter((pair) => pair.winner === "with_mcp_win").length,
      decisivePairs.length,
    ),
    unsafeCopyingRate: rate(withMcp.filter((grade) => grade.unsafeCopying).length, withMcp.length),
    fixturePreflight: rate(preflight.filter((row) => row.passed).length, preflight.length),
    allowedSearchNotes: withMcp
      .filter((grade) => grade.policyLabel === "allowed_search")
      .map((grade) => ({
        scenarioId: grade.scenarioId,
        searched: grade.searched,
        rationale: grade.searched
          ? "Search happened on a borderline case; inspect whether it improved the answer."
          : "Search skipped on a borderline case; acceptable if the final answer is still strong.",
      })),
  } satisfies BenchmarkSummary;
}

export async function runHostedSmoke(query: string): Promise<HostedSmokeResult> {
  try {
    const config = resolveConfig({ ...process.env, CLANKER_MODE: "remote" });
    const backend = createSolutionBackend(config, "remote");
    const result = await searchWithAutoFallback(backend, {
      query,
      limit: 1,
      mode: "auto",
      allowHybridFallback: Boolean(config.apiKey),
      fallbackUnavailableReason: "CLANKER_API_KEY is required for hosted hybrid fallback",
    });
    return {
      query,
      source: "remote",
      ok: true,
      resultCount: result.results.length,
      attempts: result.attempts.map((attempt) =>
        attempt.error
          ? `${attempt.mode}${attempt.keywordStrategy ? `/${attempt.keywordStrategy}` : ""}: ${attempt.error}`
          : `${attempt.mode}${attempt.keywordStrategy ? `/${attempt.keywordStrategy}` : ""}: ${attempt.resultCount ?? 0}`,
      ),
    };
  } catch (error) {
    return {
      query,
      source: "remote",
      ok: false,
      resultCount: 0,
      attempts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function analyzeBenchmark(
  input: BenchmarkInput,
  options: { hostedSmoke?: boolean; hostedSmokeQuery?: string; pricing?: PricingConfig } = {},
): Promise<BenchmarkAnalysis> {
  const scenarioById = new Map(input.scenarios.map((scenario) => [scenario.id, scenario]));
  const runGrades = input.runFiles.flatMap((file) =>
    file.data.runs.map((run) => {
      const scenario = scenarioById.get(run.scenario_id);
      if (!scenario) throw new Error(`Unknown scenario_id ${run.scenario_id} in ${file.path}`);
      return gradeRun(run, scenario, {
        model: file.data.metadata?.model,
        pricing: options.pricing,
      });
    }),
  );
  const pairGrades = gradePairs(input, runGrades);
  const fixturePreflight = validateFixtureRetrieval(input);
  const hostedSmoke = options.hostedSmoke
    ? await runHostedSmoke(options.hostedSmokeQuery ?? "EADDRINUSE")
    : undefined;
  return {
    runGrades,
    pairGrades,
    fixturePreflight,
    hostedSmoke,
    summary: summarize(input, runGrades, pairGrades, fixturePreflight),
  };
}

function formatRate(metric: SummaryMetric) {
  if (metric.rate === null) return `n/a (${metric.passed}/${metric.total})`;
  return `${Math.round(metric.rate * 100)}% (${metric.passed}/${metric.total})`;
}

function formatDelta(metric: DeltaMetric, unit: "tokens" | "ms") {
  if (metric.median === null) return `n/a (0 samples)`;
  const rounded = Math.round(metric.median);
  const suffix = unit === "tokens" ? "tokens" : "ms";
  return `${rounded >= 0 ? "+" : ""}${rounded} ${suffix} (${metric.samples} samples)`;
}

function formatUsdDelta(metric: DeltaMetric) {
  if (metric.median === null) return `n/a (0 samples)`;
  const formatted =
    Math.abs(metric.median) < 0.01 ? metric.median.toFixed(4) : metric.median.toFixed(2);
  return `${metric.median >= 0 ? "+" : ""}$${formatted} (${metric.samples} samples)`;
}

function formatPercentDelta(metric: DeltaMetric) {
  if (metric.median === null) return `n/a (0 samples)`;
  const rounded = Math.round(metric.median * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}% (${metric.samples} samples)`;
}

function escapePipes(value: string) {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function excerpt(value: string, maxLength = 360) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 3)}...`;
}

function renderMetricTable(summary: BenchmarkSummary) {
  return [
    "| Metric | Result |",
    "| --- | ---: |",
    `| Known Fix Trigger Recall | ${formatRate(summary.knownFixTriggerRecall)} |`,
    `| Known Fix Retrieval Rate | ${formatRate(summary.knownFixRetrievalRate)} |`,
    `| Learned Reuse Pass Rate | ${formatRate(summary.learnedReusePassRate)} |`,
    `| MCP Win Rate | ${formatRate(summary.mcpWinRate)} |`,
    `| Decisive MCP Win Rate | ${formatRate(summary.decisiveMcpWinRate)} |`,
    `| Must-search Recall | ${formatRate(summary.mustSearchRecall)} |`,
    `| Must-not-search Precision | ${formatRate(summary.mustNotSearchPrecision)} |`,
    `| Useful Retrieval Rate | ${formatRate(summary.usefulRetrievalRate)} |`,
    `| Unsafe-copying Rate | ${formatRate(summary.unsafeCopyingRate)} |`,
    `| Failed Recorded Runs | ${summary.failedRunCount} |`,
    `| Fixture Preflight | ${formatRate(summary.fixturePreflight)} |`,
  ].join("\n");
}

function renderSavingsTable(summary: BenchmarkSummary) {
  return [
    "| Comparison | Median Savings |",
    "| --- | ---: |",
    `| Known fix vs empty DB | ${formatDelta(summary.medianTokenSavingsKnownVsEmpty, "tokens")} |`,
    `| Known fix vs no MCP | ${formatDelta(summary.medianTokenSavingsKnownVsNoMcp, "tokens")} |`,
    `| Known fix vs empty DB cost | ${formatUsdDelta(summary.medianCostSavingsKnownVsEmpty)} |`,
    `| Known fix vs no MCP cost | ${formatUsdDelta(summary.medianCostSavingsKnownVsNoMcp)} |`,
    `| Known fix vs empty DB elapsed | ${formatDelta(summary.medianElapsedSavingsKnownVsEmpty, "ms")} |`,
    `| Known fix vs no MCP elapsed | ${formatDelta(summary.medianElapsedSavingsKnownVsNoMcp, "ms")} |`,
  ].join("\n");
}

function renderDebugCostTable(summary: BenchmarkSummary) {
  const hasCostGate = summary.debugMedianCostSavingsRateKnownVsNoMcp.median !== null;
  const savingsGate = hasCostGate
    ? summary.debugMedianCostSavingsRateKnownVsNoMcp
    : summary.debugMedianTokenSavingsRateKnownVsNoMcp;
  return [
    "| Metric | Result |",
    "| --- | ---: |",
    `| Solved matched pairs | ${summary.debugSolvedPairCount} |`,
    `| Total-token savings vs no MCP | ${formatDelta(summary.debugMedianTokenSavingsKnownVsNoMcp, "tokens")} |`,
    `| Total-token savings rate vs no MCP | ${formatPercentDelta(summary.debugMedianTokenSavingsRateKnownVsNoMcp)} |`,
    `| Estimated cost savings vs no MCP | ${formatUsdDelta(summary.debugMedianCostSavingsKnownVsNoMcp)} |`,
    `| Estimated cost savings rate vs no MCP | ${formatPercentDelta(summary.debugMedianCostSavingsRateKnownVsNoMcp)} |`,
    `| Elapsed savings vs no MCP | ${formatDelta(summary.debugMedianElapsedSavingsKnownVsNoMcp, "ms")} |`,
    `| Elapsed savings rate vs no MCP | ${formatPercentDelta(summary.debugMedianElapsedSavingsRateKnownVsNoMcp)} |`,
    `| Claim gate | ${
      (savingsGate.median ?? -Infinity) >= 0.2 &&
      (summary.debugMedianElapsedSavingsRateKnownVsNoMcp.median ?? -Infinity) >= 0.2
        ? hasCostGate
          ? "passed (cost + elapsed)"
          : "passed (token proxy + elapsed)"
        : hasCostGate
          ? "not met (cost + elapsed)"
          : "not met (token proxy + elapsed)"
    } |`,
  ].join("\n");
}

function scenarioMixTable(summary: BenchmarkSummary) {
  return [
    "| Label | Scenarios |",
    "| --- | ---: |",
    `| must_search | ${summary.policyCounts.must_search} |`,
    `| must_not_search | ${summary.policyCounts.must_not_search} |`,
    `| allowed_search | ${summary.policyCounts.allowed_search} |`,
  ].join("\n");
}

function representativeExamples(input: BenchmarkInput, analysis: BenchmarkAnalysis) {
  const scenarioById = new Map(input.scenarios.map((scenario) => [scenario.id, scenario]));
  const runsByPair = new Map<string, EvalRun[]>();
  for (const file of input.runFiles) {
    for (const run of file.data.runs) {
      const key = pairKey(run.scenario_id, run.repetition);
      runsByPair.set(key, [...(runsByPair.get(key) ?? []), run]);
    }
  }
  const examples = analysis.pairGrades
    .filter((pair) => pair.winner !== "pending")
    .slice(0, 5)
    .map((pair) => {
      const scenario = scenarioById.get(pair.scenarioId);
      const runs = runsByPair.get(pairKey(pair.scenarioId, pair.repetition)) ?? [];
      const withMcp = runs.find((run) => run.config === "with_mcp_known_fix");
      const withoutMcp = runs.find((run) => run.config === "without_mcp");
      return [
        `### ${scenario?.title ?? pair.scenarioId}`,
        `- Label: \`${scenario?.policy_label ?? "unknown"}\``,
        `- Pairwise result: \`${pair.winner}\` (${pair.source})`,
        `- Rationale: ${pair.rationale}`,
        withMcp ? `- With MCP: ${excerpt(withMcp.final_answer)}` : "- With MCP: pending",
        withoutMcp
          ? `- Without MCP: ${excerpt(withoutMcp.final_answer)}`
          : "- Without MCP: pending",
      ].join("\n");
    });
  return examples.length ? examples.join("\n\n") : "No reviewed pairs yet.";
}

function failureAnalysis(analysis: BenchmarkAnalysis) {
  const missedSearches = analysis.runGrades.filter(
    (grade) =>
      !grade.runFailed &&
      grade.config === "with_mcp_known_fix" &&
      grade.policyLabel === "must_search" &&
      !grade.searched,
  );
  const falsePositiveSearches = analysis.runGrades.filter(
    (grade) =>
      !grade.runFailed &&
      isMcpConfig(grade.config) &&
      grade.policyLabel === "must_not_search" &&
      grade.searched,
  );
  const retrievalMisses = analysis.runGrades.filter(
    (grade) =>
      !grade.runFailed && grade.config === "with_mcp_known_fix" && grade.retrievalPass === false,
  );
  const lines = [
    `- Failed recorded runs excluded from behavior metrics: ${analysis.summary.failedRunCount}`,
    `- Missed required searches: ${missedSearches.length}`,
    `- False-positive searches on must-not-search tasks: ${falsePositiveSearches.length}`,
    `- Retrieval misses after search: ${retrievalMisses.length}`,
  ];
  if (analysis.summary.allowedSearchNotes.length) {
    lines.push(
      `- Borderline allowed-search cases observed: ${analysis.summary.allowedSearchNotes.length}`,
    );
  }
  return lines.join("\n");
}

export function renderMarkdownReport(input: BenchmarkInput, analysis: BenchmarkAnalysis) {
  const hasSampleRuns = analysis.summary.sampleRunCount > 0;
  const hasRealRuns = analysis.summary.realRunCount > 0;
  const measuredAgents = [
    ...new Set(
      input.runFiles
        .filter((file) => file.data.runs.length > 0)
        .map((file) => file.data.metadata?.agent ?? "unknown-agent"),
    ),
  ];
  const measuredAgentLabel =
    measuredAgents.length === 1 ? measuredAgents[0] : measuredAgents.join(", ");
  const fixtureFailures = analysis.fixturePreflight.filter((row) => !row.passed).slice(0, 8);
  const hosted = analysis.hostedSmoke
    ? [
        "## Optional Hosted Smoke",
        `- Query: \`${analysis.hostedSmoke.query}\``,
        `- Status: ${analysis.hostedSmoke.ok ? "passed" : "failed"}`,
        `- Result count: ${analysis.hostedSmoke.resultCount}`,
        analysis.hostedSmoke.attempts.length
          ? `- Attempts: ${analysis.hostedSmoke.attempts.map((attempt) => `\`${attempt}\``).join(", ")}`
          : "",
        analysis.hostedSmoke.error ? `- Error: ${analysis.hostedSmoke.error}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "## Optional Hosted Smoke\nNot run. Use `--hosted-smoke` when credentials/network are available.";

  return [
    "# ClankerOverflow MCP Reuse Benchmark",
    "",
    analysis.summary.failedRunCount > 0
      ? "> Status: recorded run files include failed agent runs. Behavior metrics exclude failed runs."
      : hasSampleRuns && !hasRealRuns
        ? "> Status: validation sample only. This report proves the harness is wired; it is not yet a buyer-proof benchmark result."
        : "> Status: benchmark report generated from recorded run files.",
    "",
    "## Headline Metrics",
    renderMetricTable(analysis.summary),
    "",
    "## Rediscovery Cost",
    renderSavingsTable(analysis.summary),
    "",
    "## Debugging Cost Savings",
    renderDebugCostTable(analysis.summary),
    "",
    "## Coverage",
    `- Scenarios: ${analysis.summary.scenarioCount}`,
    `- Sanitized fixture fixes: ${analysis.summary.fixtureCount}`,
    `- Recorded runs: ${analysis.summary.runCount} (${analysis.summary.realRunCount} real, ${analysis.summary.sampleRunCount} sample)`,
    `- Run provenance: ${input.runFiles.map((file) => `${basename(file.path)} (${file.data.runs.length})`).join(", ") || "none"}`,
    `- Failed recorded runs excluded from behavior metrics: ${analysis.summary.failedRunCount}`,
    "",
    scenarioMixTable(analysis.summary),
    "",
    "## Methodology",
    "- Compare MCP-agent runs with a known fixture, an empty/distractor database, and no ClankerOverflow MCP.",
    "- Grade trigger behavior, useful retrieval, learned logging/reuse, final answer facts, unsafe copying, and pairwise answer quality.",
    "- Debug-workspace savings require both compared runs to pass the scenario verification command.",
    "- Use local fixture data for core reproducibility; hosted smoke is optional and excluded from headline metrics.",
    "- Treat `allowed_search` cases as qualitative notes rather than hard precision failures.",
    `- V1 outcome evidence in this report is measured with ${measuredAgentLabel}; the MCP protocol behavior is designed to be portable to other MCP-capable agents.`,
    "",
    "## Known Fix Recovery",
    [
      `- Trigger recall: ${formatRate(analysis.summary.knownFixTriggerRecall)}`,
      `- Useful retrieval: ${formatRate(analysis.summary.knownFixRetrievalRate)}`,
      `- Unsafe copying: ${formatRate(analysis.summary.unsafeCopyingRate)}`,
    ].join("\n"),
    "",
    "## Learned Reuse Loop",
    [
      `- Pass rate: ${formatRate(analysis.summary.learnedReusePassRate)}`,
      "- Pass 1 expects search, no useful known-fixture retrieval, a reusable final answer, and `log_solution`.",
      "- Pass 2 expects search and retrieval of the logged local solution.",
    ].join("\n"),
    "",
    "## Negative Controls",
    [
      `- Must-not-search precision: ${formatRate(analysis.summary.mustNotSearchPrecision)}`,
      "- Preference, conceptual, trivial UI, and private/business-logic tasks should avoid ClankerOverflow search.",
    ].join("\n"),
    "",
    "## Representative Examples",
    representativeExamples(input, analysis),
    "",
    "## Failure Analysis",
    failureAnalysis(analysis),
    "",
    fixtureFailures.length
      ? [
          "## Fixture Preflight Misses",
          "| Scenario | Fingerprint | Expected | Exact IDs | Tiered IDs | Error |",
          "| --- | --- | --- | --- | --- | --- |",
          ...fixtureFailures.map(
            (row) =>
              `| ${row.scenarioId} | ${escapePipes(row.fingerprint)} | ${row.expectedSolutionIds.join(", ")} | ${row.exactResultIds.join(", ")} | ${row.tieredResultIds.join(", ")} | ${escapePipes(row.error ?? "")} |`,
          ),
        ].join("\n")
      : "## Fixture Preflight Misses\nNone.",
    "",
    hosted,
    "",
    "## Caveats",
    "- Human review is required before using MCP Win Rate in buyer-facing material.",
    "- Sample runs are only harness validation data and must be excluded or replaced for published claims.",
    "- Cost estimates appear only when a pricing config is supplied; otherwise token/time deltas are reported without dollar claims.",
    "- Hosted search availability can be reported separately, but it is intentionally not part of the reproducible core score.",
    "",
    `Generated from \`${basename(input.workspaceDir)}\` product-proof fixtures.`,
    "",
  ].join("\n");
}

function formatGeneratedFiles(paths: string[]) {
  execFileSync("pnpm", ["exec", "oxfmt", ...paths], { stdio: "inherit" });
}

function parseArgs(argv: string[]): CliOptions {
  const workspaceDefault = resolve(process.cwd(), "clankeroverflow-mcp-workspace", "product-proof");
  const options: CliOptions = {
    workspaceDir: workspaceDefault,
    reportPath: join(workspaceDefault, "reports", "report.md"),
    summaryPath: join(workspaceDefault, "reports", "summary.json"),
    includeSampleRuns: true,
    hostedSmoke: false,
    hostedSmokeQuery: "EADDRINUSE",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--workspace":
        options.workspaceDir = resolve(next());
        break;
      case "--runs":
        options.runsPath = resolve(next());
        break;
      case "--report":
        options.reportPath = resolve(next());
        break;
      case "--summary":
        options.summaryPath = resolve(next());
        break;
      case "--pricing-config":
        options.pricingConfigPath = resolve(next());
        break;
      case "--exclude-sample":
        options.includeSampleRuns = false;
        break;
      case "--hosted-smoke":
        options.hostedSmoke = true;
        break;
      case "--hosted-smoke-query":
        options.hostedSmokeQuery = next();
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.reportPath === join(workspaceDefault, "reports", "report.md")) {
    options.reportPath = join(options.workspaceDir, "reports", "report.md");
  }
  if (options.summaryPath === join(workspaceDefault, "reports", "summary.json")) {
    options.summaryPath = join(options.workspaceDir, "reports", "summary.json");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pricing = options.pricingConfigPath
    ? readJson<PricingConfig>(options.pricingConfigPath)
    : undefined;
  const input = loadBenchmarkInput({
    workspaceDir: options.workspaceDir,
    runsPath: options.runsPath,
    includeSampleRuns: options.includeSampleRuns,
  });
  const analysis = await analyzeBenchmark(input, {
    hostedSmoke: options.hostedSmoke,
    hostedSmokeQuery: options.hostedSmokeQuery,
    pricing,
  });
  const report = renderMarkdownReport(input, analysis);
  mkdirSync(dirname(options.reportPath), { recursive: true });
  mkdirSync(dirname(options.summaryPath), { recursive: true });
  writeFileSync(options.reportPath, report);
  writeFileSync(options.summaryPath, `${JSON.stringify(analysis, null, 2)}\n`);
  formatGeneratedFiles([options.reportPath, options.summaryPath]);
  console.log(`Wrote ${options.reportPath}`);
  console.log(`Wrote ${options.summaryPath}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error: unknown) => {
    const typedError = error as FtsQuerySyntaxError | Error;
    console.error(typedError.message);
    process.exitCode = 1;
  });
}
