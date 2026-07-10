import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  type WriteFileOptions,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { openLocalDb } from "../mcp/local-db";
import {
  loadBenchmarkInput,
  seedFixtureDb,
  type EvalRun,
  type FixtureSolution,
  type RunsFile,
  type RunConfig,
  type RunUsage,
  type Scenario,
  type ToolCall,
} from "./product-proof";

export type ClaudeRecordOptions = {
  workspaceDir: string;
  outputPath: string;
  resumeFrom?: string;
  scenarios: string[];
  limit?: number;
  repetitions: number;
  model?: string;
  effort: string;
  timeoutMs: number;
  keepTemp: boolean;
};

type ClaudeStreamEvent = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  error?: string;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  terminal_reason?: string;
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
  };
  message?: {
    content?: Array<
      | { type?: "text"; text?: string }
      | { type?: "tool_use"; id?: string; name?: string; input?: Record<string, unknown> }
      | { type?: "tool_result"; tool_use_id?: string; content?: unknown; is_error?: boolean }
      | { type?: string; [key: string]: unknown }
    >;
  };
  tool_use_result?: unknown;
};

const baseConfigs: RunConfig[] = ["with_mcp_known_fix", "with_mcp_empty_db", "without_mcp"];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function readJsonLines(path: string) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ClaudeStreamEvent];
      } catch {
        return [];
      }
    });
}

function textFromUnknown(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const maybeText = value as { type?: string; text?: unknown; content?: unknown };
    if (maybeText.type === "text" && typeof maybeText.text === "string") return maybeText.text;
    return textFromUnknown(maybeText.content);
  }
  return "";
}

function extractResultIds(text: string | undefined) {
  if (!text) return [];
  return [...text.matchAll(/^ID:\s*(\S+)/gm)].map((match) => match[1]!).filter(Boolean);
}

function extractLoggedIds(text: string | undefined) {
  if (!text) return [];
  return [
    ...text.matchAll(/Solution logged locally:\s*(\S+)/g),
    ...text.matchAll(/\/solution\/([A-Za-z0-9_-]+)/g),
  ]
    .map((match) => match[1]!)
    .filter(Boolean);
}

function normalizeToolName(name: string | undefined) {
  return name?.replace(/^mcp__clankeroverflow__/, "") ?? "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

export function parseClaudeToolCalls(eventsPath: string) {
  const calls: Array<ToolCall & { id?: string }> = [];
  const byId = new Map<string, ToolCall & { id?: string }>();

  for (const event of readJsonLines(eventsPath)) {
    for (const part of event.message?.content ?? []) {
      if (isRecord(part) && part.type === "tool_use") {
        const id = stringField(part, "id");
        const input = isRecord(part.input) ? part.input : undefined;
        const call: ToolCall & { id?: string } = {
          id,
          name: normalizeToolName(stringField(part, "name")),
          arguments: input,
          result_ids: [],
          logged_ids: [],
        };
        calls.push(call);
        if (id) byId.set(id, call);
      } else if (isRecord(part) && part.type === "tool_result") {
        const toolUseId = stringField(part, "tool_use_id");
        const call = toolUseId ? byId.get(toolUseId) : undefined;
        if (!call) continue;
        const text = textFromUnknown(part.content);
        call.result_ids = [...new Set([...(call.result_ids ?? []), ...extractResultIds(text)])];
        call.logged_ids = [...new Set([...(call.logged_ids ?? []), ...extractLoggedIds(text)])];
      }
    }

    if (event.tool_use_result) {
      const text = textFromUnknown(event.tool_use_result);
      const lastCall = calls.at(-1);
      if (lastCall) {
        lastCall.result_ids = [
          ...new Set([...(lastCall.result_ids ?? []), ...extractResultIds(text)]),
        ];
        lastCall.logged_ids = [
          ...new Set([...(lastCall.logged_ids ?? []), ...extractLoggedIds(text)]),
        ];
      }
    }
  }

  return calls.map(({ id: _id, ...call }) => call);
}

export function parseClaudeUsage(eventsPath: string, elapsedMs: number): RunUsage | undefined {
  const result = readJsonLines(eventsPath)
    .filter((event) => event.type === "result")
    .findLast((event) => event.usage);
  const usage = result?.usage;
  if (!usage) return undefined;
  const uncachedInputTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const cachedInputTokens = usage.cache_read_input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  return {
    input_tokens: uncachedInputTokens + cachedInputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_output_tokens: 0,
    total_provider_tokens: uncachedInputTokens + cachedInputTokens + outputTokens,
    elapsed_ms: result.duration_ms ?? elapsedMs,
  };
}

function finalAnswerFromEvents(eventsPath: string) {
  const result = readJsonLines(eventsPath)
    .filter((event) => event.type === "result")
    .findLast((event) => typeof event.result === "string");
  if (typeof result?.result === "string") return result.result.trim();

  return readJsonLines(eventsPath)
    .flatMap((event) => event.message?.content ?? [])
    .flatMap((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n")
    .trim();
}

function firstSearchQuery(toolCalls: ToolCall[]) {
  const search = toolCalls.find((call) => call.name === "search_solutions");
  const query = search?.arguments?.query;
  return typeof query === "string" ? query : null;
}

function returnedSolutionIds(toolCalls: ToolCall[]) {
  return [...new Set(toolCalls.flatMap((call) => call.result_ids ?? []))];
}

function loggedSolutionIds(toolCalls: ToolCall[]) {
  return [...new Set(toolCalls.flatMap((call) => call.logged_ids ?? []))];
}

function evalPrompt(scenario: Scenario, config: RunConfig) {
  if (scenario.task_type === "debug_workspace") {
    const command = scenario.agent_verification_command ?? scenario.verification_command;
    return [
      "Fix the failing workspace as a concise engineering agent.",
      "Edit files as needed in the current working directory.",
      "After making the fix, run the verification command yourself.",
      "",
      `Verification command: ${command}`,
      "",
      "User request:",
      scenario.prompt,
    ].join("\n");
  }
  return [
    "Answer the following user request as a concise engineering assistant.",
    "Do not edit files or make persistent changes.",
    config === "learn_then_reuse_pass1"
      ? "For this benchmark pass, if ClankerOverflow has no useful prior fix and you can provide a reusable technical fix, log the reusable solution with log_solution before the final answer."
      : "",
    "",
    "User request:",
    scenario.prompt,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatGeneratedJson(path: string) {
  execFileSync("pnpm", ["exec", "oxfmt", path], { stdio: "inherit" });
}

function claudeSettingsPath(root: string) {
  const source = join(process.env.HOME || "", ".claude", "settings.json");
  const settingsPath = join(root, "settings.json");
  let env: Record<string, unknown> = {};
  try {
    const settings = JSON.parse(readFileSync(source, "utf8")) as { env?: Record<string, unknown> };
    env = settings.env ?? {};
  } catch {
    env = {};
  }
  writeFileSync(
    settingsPath,
    `${JSON.stringify(
      {
        env,
        permissions: { defaultMode: "bypassPermissions" },
        skipDangerousModePermissionPrompt: true,
      },
      null,
      2,
    )}\n`,
  );
  return settingsPath;
}

function mcpConfigPath(root: string, fixtureDbPath: string, enabled: boolean) {
  const configPath = join(root, "mcp.json");
  const mcpServers = enabled
    ? {
        clankeroverflow: {
          type: "stdio",
          command: "pnpm",
          args: ["--dir", repoRoot, "exec", "tsx", "packages/cli/src/index.ts", "mcp"],
          env: {
            CLANKER_MODE: "local",
            CLANKER_LOCAL_DB: fixtureDbPath,
            CLANKER_LOCAL_SEMANTIC: "0",
          },
        },
      }
    : {};
  writeFileSync(configPath, `${JSON.stringify({ mcpServers }, null, 2)}\n`);
  return configPath;
}

function appendSystemPrompt(config: RunConfig) {
  if (config === "without_mcp") {
    return "ClankerOverflow is not available in this benchmark configuration.";
  }
  return [
    readFileSync(join(repoRoot, "packages/cli/skills/clankeroverflow-mcp/SKILL.md"), "utf8"),
    "Claude CLI note: if MCP servers or tools are pending, call WaitForMcpServers before deciding ClankerOverflow is unavailable. Then use mcp__clankeroverflow__search_solutions or mcp__clankeroverflow__log_solution directly.",
  ].join("\n\n");
}

export function claudeCommand() {
  return process.env.CLAUDE_BIN || "claude";
}

export function claudeArgs(
  options: ClaudeRecordOptions,
  config: RunConfig,
  prompt: string,
  mcpConfig: string,
) {
  const args = [
    "-p",
    "--verbose",
    "--output-format",
    "stream-json",
    "--strict-mcp-config",
    "--mcp-config",
    mcpConfig,
    "--settings",
    claudeSettingsPath(dirname(mcpConfig)),
    "--permission-mode",
    "bypassPermissions",
    "--effort",
    options.effort,
    "--no-session-persistence",
    "--append-system-prompt",
    appendSystemPrompt(config),
  ];
  if (options.model) args.push("--model", options.model);
  args.push(prompt);
  return args;
}

function listFiles(root: string, dir = root): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry === ".git") return [];
    const fullPath = join(dir, entry);
    const relativePath = fullPath.slice(root.length + 1);
    const stat = statSync(fullPath);
    return stat.isDirectory() ? listFiles(root, fullPath) : [relativePath];
  });
}

function fileHashes(root: string) {
  const hashes = new Map<string, string>();
  for (const file of listFiles(root)) {
    const hash = createHash("sha256")
      .update(readFileSync(join(root, file)))
      .digest("hex");
    hashes.set(file, hash);
  }
  return hashes;
}

function changedFiles(before: Map<string, string>, after: Map<string, string>) {
  const files = new Set([...before.keys(), ...after.keys()]);
  return [...files].filter((file) => before.get(file) !== after.get(file)).sort();
}

function workspaceForScenario(options: ClaudeRecordOptions, scenario: Scenario, safeId: string) {
  if (scenario.task_type !== "debug_workspace") {
    return mkdtempSync(join(tmpdir(), "clanker-claude-eval-workspace-"));
  }
  if (!scenario.workspace_fixture) {
    throw new Error(`Scenario ${scenario.id} is missing workspace_fixture`);
  }
  const source = join(options.workspaceDir, "workspace-fixtures", scenario.workspace_fixture);
  if (!existsSync(source)) throw new Error(`Missing workspace fixture ${source}`);
  const workspace = mkdtempSync(join(tmpdir(), `clanker-claude-debug-${safeId}-`));
  cpSync(source, workspace, { recursive: true });
  return workspace;
}

function verifyWorkspace(scenario: Scenario, benchmarkWorkspaceDir: string, workspacePath: string) {
  if (scenario.task_type !== "debug_workspace" || !scenario.verification_command) {
    return {};
  }
  const quote = (value: string) => JSON.stringify(value);
  const command = scenario.verification_command
    .replaceAll("{workspace}", quote(workspacePath))
    .replaceAll("{workspaceDir}", quote(benchmarkWorkspaceDir));
  const result = spawnSync(command, {
    cwd: workspacePath,
    shell: true,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    verification_command: command,
    verification_passed: result.status === 0,
    verification_stdout: result.stdout ?? "",
    verification_stderr: result.stderr ?? "",
  };
}

function createClaudeEnvironment(safeId: string) {
  const root = mkdtempSync(join(tmpdir(), `clanker-claude-home-${safeId}-`));
  const home = join(root, "home");
  const claudeHome = join(home, ".claude");
  mkdirSync(claudeHome, { recursive: true });
  return { root, home, claudeHome };
}

function runClaude(
  options: ClaudeRecordOptions,
  config: RunConfig,
  scenario: Scenario,
  repetition: number,
  fixtureDbPath: string,
  traceDir: string,
) {
  const safeId = `${scenario.id}-${config}-r${repetition}`;
  const eventsPath = join(traceDir, `${safeId}.claude.events.jsonl`);
  const stderrPath = join(traceDir, `${safeId}.claude.stderr.log`);
  const prompt = evalPrompt(scenario, config);
  const workspacePath = workspaceForScenario(options, scenario, safeId);
  const claudeEnvironment = createClaudeEnvironment(safeId);
  const mcpConfig = mcpConfigPath(claudeEnvironment.root, fixtureDbPath, config !== "without_mcp");
  const beforeHashes = fileHashes(workspacePath);
  const args = claudeArgs(options, config, prompt, mcpConfig);
  const env = {
    ...process.env,
    HOME: claudeEnvironment.home,
    CLAUDE_CONFIG_DIR: claudeEnvironment.claudeHome,
    CLANKER_MODE: "local",
    CLANKER_LOCAL_DB: fixtureDbPath,
    CLANKER_LOCAL_SEMANTIC: "0",
  };

  const startedAt = Date.now();
  const result = spawnSync(claudeCommand(), args, {
    cwd: workspacePath,
    env,
    encoding: "utf8",
    input: "",
    timeout: options.timeoutMs,
    maxBuffer: 96 * 1024 * 1024,
  });
  const elapsedMs = Date.now() - startedAt;

  writeFileSync(eventsPath, result.stdout ?? "");
  writeFileSync(stderrPath, result.stderr ?? "");
  const afterHashes = fileHashes(workspacePath);
  const verification = verifyWorkspace(scenario, options.workspaceDir, workspacePath);
  if (!options.keepTemp) rmSync(workspacePath, { recursive: true, force: true });
  rmSync(claudeEnvironment.root, { recursive: true, force: true });

  const finalAnswer = finalAnswerFromEvents(eventsPath);
  const toolCalls = parseClaudeToolCalls(eventsPath);
  const usage = parseClaudeUsage(eventsPath, elapsedMs);
  const resultEvent = readJsonLines(eventsPath)
    .filter((event) => event.type === "result")
    .at(-1);
  const failed = result.status !== 0 || Boolean(resultEvent?.is_error);

  return {
    scenario_id: scenario.id,
    config,
    repetition,
    status: failed ? "failed" : "completed",
    error: failed
      ? [resultEvent?.error, result.stderr]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .join("\n")
      : undefined,
    transcript: `events: ${eventsPath}\nstderr: ${stderrPath}`,
    usage,
    cost_estimate: null,
    tool_calls: toolCalls,
    search_query: firstSearchQuery(toolCalls),
    returned_solution_ids: returnedSolutionIds(toolCalls),
    logged_solution_ids: loggedSolutionIds(toolCalls),
    workspace_path: options.keepTemp ? workspacePath : undefined,
    ...verification,
    changed_files: changedFiles(beforeHashes, afterHashes),
    final_answer: finalAnswer || `Claude CLI failed with status ${result.status ?? "unknown"}.`,
  } satisfies EvalRun;
}

function parseArgs(argv: string[]): ClaudeRecordOptions {
  const workspaceDefault = resolve(process.cwd(), "clankeroverflow-mcp-workspace", "product-proof");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options: ClaudeRecordOptions = {
    workspaceDir: workspaceDefault,
    outputPath: join(workspaceDefault, "runs", `claude-real-${stamp}.json`),
    scenarios: [],
    repetitions: 1,
    effort: "low",
    timeoutMs: 300_000,
    keepTemp: false,
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
      case "--output":
        options.outputPath = resolve(next());
        break;
      case "--resume-from":
        options.resumeFrom = resolve(next());
        break;
      case "--scenario":
        options.scenarios.push(next());
        break;
      case "--limit":
        options.limit = Number(next());
        if (!Number.isInteger(options.limit) || options.limit <= 0) {
          throw new Error("--limit must be a positive integer");
        }
        break;
      case "--repetitions":
        options.repetitions = Number(next());
        if (!Number.isInteger(options.repetitions) || options.repetitions <= 0) {
          throw new Error("--repetitions must be a positive integer");
        }
        break;
      case "--model":
        options.model = next();
        break;
      case "--effort":
        options.effort = next();
        break;
      case "--reasoning-effort":
        options.effort = next();
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(next());
        if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
          throw new Error("--timeout-ms must be a positive integer");
        }
        break;
      case "--keep-temp":
        options.keepTemp = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function runKey(run: Pick<EvalRun, "scenario_id" | "config" | "repetition">) {
  return `${run.scenario_id}\0${run.config}\0${run.repetition}`;
}

function isCompletedRun(run: EvalRun | undefined) {
  return Boolean(
    run && run.status !== "failed" && !run.final_answer.startsWith("Claude CLI failed"),
  );
}

function readRunsFile(path: string): RunsFile {
  return JSON.parse(readFileSync(path, "utf8")) as RunsFile;
}

function write(path: string, data: string, options?: WriteFileOptions) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, options);
}

function resetDbFiles(dbPath: string) {
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
}

function seedDb(dbPath: string, fixtures: FixtureSolution[]) {
  resetDbFiles(dbPath);
  const db = openLocalDb(dbPath);
  seedFixtureDb(db, fixtures);
  db.close();
}

function fixturesWithoutScenario(fixtures: FixtureSolution[], scenario: Scenario) {
  const excluded = new Set(scenario.fixture_solution_ids);
  return fixtures.filter((fixture) => !excluded.has(fixture.id));
}

function configsForScenario(scenario: Scenario): RunConfig[] {
  return scenario.learned_reuse
    ? [...baseConfigs, "learn_then_reuse_pass1", "learn_then_reuse_pass2"]
    : baseConfigs;
}

function dbPathForConfig(
  traceDir: string,
  scenario: Scenario,
  config: RunConfig,
  repetition: number,
) {
  if (config === "learn_then_reuse_pass1" || config === "learn_then_reuse_pass2") {
    return join(traceDir, `${scenario.id}-learned-r${repetition}.sqlite`);
  }
  return join(traceDir, `${scenario.id}-${config}-r${repetition}.sqlite`);
}

function prepareDbForRun(
  traceDir: string,
  fixtures: FixtureSolution[],
  scenario: Scenario,
  config: RunConfig,
  repetition: number,
) {
  const dbPath = dbPathForConfig(traceDir, scenario, config, repetition);
  if (config === "with_mcp_known_fix" || config === "without_mcp") {
    seedDb(dbPath, fixtures);
  } else if (config === "with_mcp_empty_db" || config === "learn_then_reuse_pass1") {
    seedDb(dbPath, fixturesWithoutScenario(fixtures, scenario));
  }
  return dbPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const input = loadBenchmarkInput({
    workspaceDir: options.workspaceDir,
    includeSampleRuns: false,
  });
  const selected = input.scenarios
    .filter((scenario) => !options.scenarios.length || options.scenarios.includes(scenario.id))
    .slice(0, options.limit ?? input.scenarios.length);
  if (!selected.length) throw new Error("No scenarios selected");

  const traceDir = join(
    options.workspaceDir,
    "runs",
    "traces",
    basename(options.outputPath).replace(/\.json$/, ""),
  );
  mkdirSync(traceDir, { recursive: true });

  const previousRuns = options.resumeFrom ? readRunsFile(options.resumeFrom).runs : [];
  const runMap = new Map(previousRuns.map((run) => [runKey(run), run]));
  const runOrder: Array<Pick<EvalRun, "scenario_id" | "config" | "repetition">> = [];
  for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
    for (const scenario of selected) {
      for (const config of configsForScenario(scenario)) {
        const keyShape = { scenario_id: scenario.id, config, repetition };
        runOrder.push(keyShape);
        const key = runKey(keyShape);
        if (isCompletedRun(runMap.get(key))) {
          console.log(`Skipping ${scenario.id} ${config} repetition ${repetition} (completed)`);
          continue;
        }
        console.log(`Running ${scenario.id} ${config} repetition ${repetition}`);
        const fixtureDbPath = prepareDbForRun(
          traceDir,
          input.fixtures,
          scenario,
          config,
          repetition,
        );
        const run = runClaude(options, config, scenario, repetition, fixtureDbPath, traceDir);
        runMap.set(key, run);
        const runs = runOrder.flatMap((shape) => {
          const run = runMap.get(runKey(shape));
          return run ? [run] : [];
        });
        const partial: RunsFile = {
          metadata: {
            name: "real paired Claude CLI runs",
            sample: false,
            agent: "claude-cli",
            model: options.model ?? "configured-default",
            created_at: new Date().toISOString(),
            notes: `Partial/in-progress safe file. Effort: ${options.effort}.`,
          },
          runs,
          pairwise_reviews: [],
        };
        write(options.outputPath, `${JSON.stringify(partial, null, 2)}\n`);
        formatGeneratedJson(options.outputPath);
      }
    }
  }

  const runs = runOrder.flatMap((shape) => {
    const run = runMap.get(runKey(shape));
    return run ? [run] : [];
  });
  const output: RunsFile = {
    metadata: {
      name: "real paired Claude CLI runs",
      sample: false,
      agent: "claude-cli",
      model: options.model ?? "configured-default",
      created_at: new Date().toISOString(),
      notes: `Effort: ${options.effort}. Per-run fixture DBs live under ${traceDir}.`,
    },
    runs,
    pairwise_reviews: [],
  };
  write(options.outputPath, `${JSON.stringify(output, null, 2)}\n`);
  formatGeneratedJson(options.outputPath);
  console.log(`Wrote ${options.outputPath}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
