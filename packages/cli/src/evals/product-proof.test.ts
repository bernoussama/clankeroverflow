import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
  analyzeBenchmark,
  estimateCost,
  gradeRun,
  loadBenchmarkInput,
  renderMarkdownReport,
  validateFixtureRetrieval,
  seedFixtureDb,
  type FixtureSolution,
  type Scenario,
} from "./product-proof";
import { openLocalDb } from "../mcp/local-db";
import { LocalBackend } from "../mcp/local-backend";

const testDir = dirname(fileURLToPath(import.meta.url));
const productProofDir = resolve(testDir, "../../../../clankeroverflow-mcp-workspace/product-proof");

describe("product-proof MCP eval harness", () => {
  test("loads the buyer-facing scenario and fixture pack", () => {
    const input = loadBenchmarkInput({ workspaceDir: productProofDir });

    expect(input.scenarios).toHaveLength(38);
    expect(input.fixtures.length).toBeGreaterThan(10);
    expect(input.scenarios.some((scenario) => scenario.policy_label === "allowed_search")).toBe(
      true,
    );
  });

  test("loads debug workspace scenarios for cost-claim runs", () => {
    const input = loadBenchmarkInput({ workspaceDir: productProofDir });
    const debugScenarios = input.scenarios.filter(
      (scenario) => scenario.task_type === "debug_workspace",
    );

    expect(debugScenarios).toHaveLength(8);
    expect(debugScenarios.every((scenario) => scenario.workspace_fixture)).toBe(true);
    expect(debugScenarios.every((scenario) => scenario.agent_verification_command)).toBe(true);
    expect(debugScenarios.every((scenario) => scenario.verification_command)).toBe(true);
    expect(debugScenarios.every((scenario) => scenario.cost_claim_eligible)).toBe(true);
  });

  test("debug workspace fixtures fail before an agent fix", () => {
    const input = loadBenchmarkInput({ workspaceDir: productProofDir });
    const debugScenarios = input.scenarios.filter(
      (scenario) => scenario.task_type === "debug_workspace",
    );

    for (const scenario of debugScenarios) {
      const fixtureDir = resolve(
        productProofDir,
        "workspace-fixtures",
        scenario.workspace_fixture!,
      );
      const publicResult = spawnSync(scenario.agent_verification_command!, {
        cwd: fixtureDir,
        shell: true,
        encoding: "utf8",
      });
      const hiddenCommand = scenario
        .verification_command!.replaceAll("{workspace}", JSON.stringify(fixtureDir))
        .replaceAll("{workspaceDir}", JSON.stringify(productProofDir));
      const hiddenResult = spawnSync(hiddenCommand, {
        cwd: fixtureDir,
        shell: true,
        encoding: "utf8",
      });
      expect(publicResult.status, `${scenario.id} public test should start broken`).not.toBe(0);
      expect(hiddenResult.status, `${scenario.id} hidden verifier should start broken`).not.toBe(0);
    }
  });

  test("debug workspace hidden verifiers accept canonical fixes", () => {
    const cases = [
      {
        fixture: "debug-eaddrinuse-ci",
        file: "server.mjs",
        source:
          "export const port = 0;\nexport function selectedPort(server) { return server.address().port; }\n",
      },
      {
        fixture: "debug-stripe-workers",
        file: "webhook.mjs",
        source:
          "export async function verifyWebhook(stripe, rawBody, signature, secret) {\n  return stripe.webhooks.constructEventAsync(rawBody, signature, secret);\n}\n",
      },
      {
        fixture: "debug-neon-first-query",
        file: "db.mjs",
        source:
          "export async function createBranchAndQuery(neon, sql) {\n  await neon.createBranch();\n  for (let attempt = 0; attempt < 5; attempt += 1) {\n    try { await sql`select 1`; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }\n  }\n  return sql`select * from users limit 1`;\n}\n",
      },
      {
        fixture: "debug-inertia-noindex",
        file: "app.blade.php",
        source:
          '<html>\n  <head>\n    <meta name="robots" content="noindex">\n    @inertiaHead\n  </head>\n  <body>@inertia</body>\n</html>\n',
      },
    ];

    for (const testCase of cases) {
      const dir = mkdtempSync(join(tmpdir(), `clanker-${testCase.fixture}-fixed-`));
      try {
        cpSync(resolve(productProofDir, "workspace-fixtures", testCase.fixture), dir, {
          recursive: true,
        });
        writeFileSync(join(dir, testCase.file), testCase.source);
        const result = spawnSync(
          `node ${JSON.stringify(resolve(productProofDir, "workspace-verifiers", `${testCase.fixture}.mjs`))} ${JSON.stringify(dir)}`,
          {
            cwd: dir,
            shell: true,
            encoding: "utf8",
          },
        );
        expect(result.status, `${testCase.fixture} canonical fix should pass`).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test("grades an exact-keyword must-search hit", () => {
    const input = loadBenchmarkInput({ workspaceDir: productProofDir });
    const scenario = input.scenarios.find((item) => item.id === "ts2307-pnpm-workspaces");
    expect(scenario).toBeDefined();

    const grade = gradeRun(
      {
        scenario_id: "ts2307-pnpm-workspaces",
        config: "with_mcp_known_fix",
        repetition: 1,
        tool_calls: [
          {
            name: "search_solutions",
            arguments: { query: "TS2307 pnpm" },
            result_ids: ["fix-ts2307-pnpm-workspace-dep"],
          },
        ],
        final_answer:
          "Add the sibling package as a workspace:* dependency, run pnpm install, and do not rely only on paths.",
      },
      scenario!,
    );

    expect(grade.triggerPass).toBe(true);
    expect(grade.queryConcisePass).toBe(true);
    expect(grade.queryMatchPass).toBe(true);
    expect(grade.retrievalPass).toBe(true);
    expect(grade.expectedFactHits).toContain("workspace:*");
  });

  test("validates a fallback-style local fixture retrieval without hosted credentials", () => {
    const fixture: FixtureSolution = {
      id: "fix-vite-container-host",
      problem: "Vite dev server is unreachable from a container",
      solution: "Bind Vite to 0.0.0.0 with --host so the host browser can reach it.",
      tags: ["vite", "container"],
    };
    const scenario: Scenario = {
      id: "vite-container-host",
      title: "Vite container host access",
      category: "fixture-test",
      policy_label: "must_search",
      solution_leverage: true,
      prompt: "Vite in Docker says page cannot be reached from host.",
      fixture_solution_ids: [fixture.id],
      acceptable_query_fingerprints: ["vite container page cannot be reached from host"],
      expected_key_facts: ["0.0.0.0", "--host"],
      rubric_notes: "Exact keyword should miss, tiered keyword should recover.",
    };

    const [result] = validateFixtureRetrieval({ scenarios: [scenario], fixtures: [fixture] });

    expect(result?.passed).toBe(true);
    expect(result?.usedFallback).toBe(true);
    expect(result?.tieredResultIds).toContain(fixture.id);
  });

  test("learned reuse can log into an empty local DB and retrieve the learned solution", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-learned-reuse-"));
    const dbPath = join(dir, "solutions.sqlite");
    try {
      const db = openLocalDb(dbPath);
      seedFixtureDb(db, []);
      db.close();

      const backend = new LocalBackend(dbPath);
      const logged = await backend.log({
        problem: "TS2307 Cannot find module in pnpm workspace",
        solution: "Declare the sibling package as a workspace:* dependency and run pnpm install.",
        tags: "typescript,pnpm,monorepo",
      });
      const found = await backend.search({
        query: "TS2307 pnpm workspace",
        limit: 5,
        mode: "keyword",
      });

      expect(found.map((row) => row.id)).toContain(logged.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("grades must-not-search and allowed-search policy differently", () => {
    const input = loadBenchmarkInput({ workspaceDir: productProofDir });
    const mustNot = input.scenarios.find((item) => item.id === "swr-vs-reactquery");
    const allowed = input.scenarios.find((item) => item.id === "dark-mode-hydration-toggle");
    expect(mustNot).toBeDefined();
    expect(allowed).toBeDefined();

    const mustNotGrade = gradeRun(
      {
        scenario_id: "swr-vs-reactquery",
        config: "with_mcp_known_fix",
        repetition: 1,
        tool_calls: [],
        final_answer:
          "This is a tradeoff question; choose based on app complexity and team preference.",
      },
      mustNot!,
    );
    const allowedGrade = gradeRun(
      {
        scenario_id: "dark-mode-hydration-toggle",
        config: "with_mcp_known_fix",
        repetition: 1,
        tool_calls: [
          {
            name: "search_solutions",
            arguments: { query: "dark mode localStorage hydration" },
            result_ids: ["fix-nextjs-dark-mode-hydration-fouc"],
          },
        ],
        final_answer: "Persist in localStorage and apply the class before paint to avoid a flash.",
      },
      allowed!,
    );

    expect(mustNotGrade.triggerPass).toBe(true);
    expect(allowedGrade.triggerPass).toBeNull();
    expect(allowedGrade.retrievalPass).toBe(true);
  });

  test("excludes failed recorder runs from behavior metrics", async () => {
    const input = loadBenchmarkInput({
      workspaceDir: productProofDir,
      runsPath: resolve(productProofDir, "runs/sample-runs.json"),
    });
    const failedScenario = input.scenarios.find((item) => item.policy_label === "must_search");
    expect(failedScenario).toBeDefined();

    const analysis = await analyzeBenchmark({
      ...input,
      runFiles: [
        {
          path: "failed-run.json",
          data: {
            metadata: { sample: false },
            runs: [
              {
                scenario_id: failedScenario!.id,
                config: "with_mcp_known_fix",
                repetition: 1,
                status: "failed",
                final_answer: "Codex exec failed with status unknown.",
              },
            ],
            pairwise_reviews: [],
          },
        },
      ],
    });

    expect(analysis.summary.failedRunCount).toBe(1);
    expect(analysis.summary.knownFixTriggerRecall.total).toBe(0);
  });

  test("computes usage, cost, savings, and learned-reuse metrics", async () => {
    const input = loadBenchmarkInput({
      workspaceDir: productProofDir,
      runsPath: resolve(productProofDir, "runs/sample-runs.json"),
    });
    const analysis = await analyzeBenchmark(input, {
      pricing: {
        model: {
          input_per_1m: 1,
          cached_input_per_1m: 0.25,
          output_per_1m: 4,
          reasoning_output_per_1m: 4,
        },
      },
    });
    const report = renderMarkdownReport(input, analysis);

    expect(analysis.summary.knownFixTriggerRecall.passed).toBe(2);
    expect(analysis.summary.knownFixRetrievalRate.passed).toBe(2);
    expect(analysis.summary.learnedReusePassRate.passed).toBe(1);
    expect(analysis.summary.medianTokenSavingsKnownVsEmpty.median).toBeGreaterThan(0);
    expect(analysis.summary.medianCostSavingsKnownVsEmpty.median).toBeGreaterThan(0);
    expect(analysis.summary.medianElapsedSavingsKnownVsNoMcp.median).toBeGreaterThan(0);
    expect(analysis.summary.debugSolvedPairCount).toBe(0);
    expect(analysis.summary.mcpWinRate.passed).toBe(2);
    expect(analysis.summary.mcpWinRate.total).toBe(3);
    expect(analysis.summary.sampleRunCount).toBeGreaterThan(0);
    expect(
      analysis.runGrades.find((grade) => grade.usage)?.costEstimate?.total_usd,
    ).toBeGreaterThan(0);
    expect(report).toContain("validation sample only");
    expect(report).toContain("ClankerOverflow MCP Reuse Benchmark");
    expect(report).toContain("Known Fix Recovery");
    expect(report).toContain("Rediscovery Cost");
    expect(report).toContain("Known fix vs no MCP cost");
    expect(report).toContain("Debugging Cost Savings");
    expect(report).toContain("Estimated cost savings vs no MCP");
    expect(report).toContain("Learned Reuse Loop");
  });

  test("computes debug cost savings only for verified matched pairs", async () => {
    const scenario: Scenario = {
      id: "debug-cost-sample",
      title: "Debug cost sample",
      category: "debug-cost",
      task_type: "debug_workspace",
      policy_label: "must_search",
      solution_leverage: true,
      prompt: "Fix it",
      workspace_fixture: "sample",
      verification_command: "node verify.mjs",
      fixture_solution_ids: ["fix-debug-cost-sample"],
      acceptable_query_fingerprints: ["debug cost"],
      expected_key_facts: ["fixed"],
      rubric_notes: "Verified runs only.",
      expected_behavior: "search",
      cost_claim_eligible: true,
    };
    const analysis = await analyzeBenchmark({
      workspaceDir: productProofDir,
      scenarios: [scenario],
      fixtures: [
        {
          id: "fix-debug-cost-sample",
          problem: "debug cost",
          solution: "fixed",
          tags: ["debug"],
        },
      ],
      runFiles: [
        {
          path: "debug-runs.json",
          data: {
            metadata: { sample: false },
            runs: [
              {
                scenario_id: scenario.id,
                config: "with_mcp_known_fix",
                repetition: 1,
                status: "completed",
                tool_calls: [{ name: "search_solutions", result_ids: ["fix-debug-cost-sample"] }],
                verification_passed: true,
                final_answer: "fixed",
                usage: {
                  input_tokens: 100,
                  cached_input_tokens: 0,
                  output_tokens: 10,
                  reasoning_output_tokens: 0,
                  total_provider_tokens: 110,
                  elapsed_ms: 1000,
                },
              },
              {
                scenario_id: scenario.id,
                config: "without_mcp",
                repetition: 1,
                status: "completed",
                verification_passed: true,
                final_answer: "fixed",
                usage: {
                  input_tokens: 200,
                  cached_input_tokens: 0,
                  output_tokens: 20,
                  reasoning_output_tokens: 0,
                  total_provider_tokens: 220,
                  elapsed_ms: 2000,
                },
              },
            ],
          },
        },
      ],
    });

    expect(analysis.summary.debugSolvedPairCount).toBe(1);
    expect(analysis.summary.debugMedianTokenSavingsKnownVsNoMcp.median).toBe(110);
    expect(analysis.summary.debugMedianCostSavingsKnownVsNoMcp.median).toBeNull();
    expect(analysis.summary.debugMedianElapsedSavingsKnownVsNoMcp.median).toBe(1000);
    expect(analysis.summary.debugMedianTokenSavingsRateKnownVsNoMcp.median).toBe(0.5);
    expect(analysis.summary.debugMedianCostSavingsRateKnownVsNoMcp.median).toBeNull();
    expect(analysis.summary.debugMedianElapsedSavingsRateKnownVsNoMcp.median).toBe(0.5);
  });

  test("keeps dollar cost null without pricing config", () => {
    expect(
      estimateCost(
        {
          input_tokens: 1000,
          cached_input_tokens: 100,
          output_tokens: 200,
          reasoning_output_tokens: 50,
          total_provider_tokens: 1250,
          elapsed_ms: 1000,
        },
        "model",
        undefined,
      ),
    ).toBeNull();
  });
});
