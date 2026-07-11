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
  symlinkSync,
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

export type RecordOptions = {
  workspaceDir: string;
  outputPath: string;
  resumeFrom?: string;
  scenarios: string[];
  limit?: number;
  repetitions: number;
  model?: string;
  reasoningEffort: string;
  timeoutMs: number;
  keepTemp: boolean;
};

type CodexJsonItem = {
  type?: string;
  message?: string;
  error?: { message?: string } | null;
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
  };
  item?: {
    type?: string;
    server?: string;
    tool?: string;
    arguments?: Record<string, unknown>;
    result?: {
      content?: Array<{ type?: string; text?: string }>;
    } | null;
    error?: { message?: string } | null;
    text?: string;
  };
};

const baseConfigs: RunConfig[] = ["with_mcp_known_fix", "with_mcp_empty_db", "without_mcp"];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function readJsonLines(path: string) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as CodexJsonItem];
      } catch {
        return [];
      }
    });
}

function resultText(item: CodexJsonItem["item"]) {
  return item?.result?.content
    ?.filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
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

export function parseToolCalls(eventsPath: string) {
  const calls: ToolCall[] = [];
  for (const event of readJsonLines(eventsPath)) {
    const item = event.item;
    if (item?.type !== "mcp_tool_call") continue;
    calls.push({
      name: item.tool ?? "unknown",
      arguments: item.arguments,
      result_ids: extractResultIds(resultText(item)),
      logged_ids: extractLoggedIds(resultText(item)),
    });
  }
  return calls;
}

export function parseUsage(eventsPath: string, elapsedMs: number): RunUsage | undefined {
  const usage = readJsonLines(eventsPath)
    .map((event) => event.usage)
    .findLast(Boolean);
  if (!usage) return undefined;
  const inputTokens = usage.input_tokens ?? 0;
  const cachedInputTokens = usage.cached_input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const reasoningOutputTokens = usage.reasoning_output_tokens ?? 0;
  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoningOutputTokens,
    total_provider_tokens: inputTokens + outputTokens + reasoningOutputTokens,
    elapsed_ms: elapsedMs,
  };
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

function eventErrorMessages(eventsPath: string) {
  return [
    ...new Set(
      readJsonLines(eventsPath)
        .map(
          (event) =>
            event.message ??
            event.error?.message ??
            event.item?.text ??
            event.item?.error?.message ??
            event.usage ??
            event,
        )
        .flatMap((value) => {
          if (typeof value === "string") return [value];
          if (
            value &&
            typeof value === "object" &&
            "message" in value &&
            typeof value.message === "string"
          ) {
            return [value.message];
          }
          return [];
        }),
    ),
  ];
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

export function codexArgs(
  options: RecordOptions,
  config: RunConfig,
  outputPath: string,
  prompt: string,
  workspacePath?: string,
) {
  const args = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--json",
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    "-C",
    workspacePath ?? mkdtempSync(join(tmpdir(), "clanker-codex-eval-workspace-")),
    "-c",
    "features.hooks=false",
    "-c",
    "mcp_servers.clankeroverflow.enabled=true",
    "-c",
    'mcp_servers.clankeroverflow.command="pnpm"',
    "-c",
    `mcp_servers.clankeroverflow.args=${JSON.stringify([
      "--dir",
      repoRoot,
      "exec",
      "tsx",
      "packages/cli/src/index.ts",
      "mcp",
    ])}`,
    "-c",
    `model_reasoning_effort="${options.reasoningEffort}"`,
    "-o",
    outputPath,
  ];
  if (options.model) args.push("-m", options.model);
  if (config === "without_mcp") {
    args.push("-c", "mcp_servers.clankeroverflow.enabled=false");
  }
  args.push(prompt);
  return args;
}

export function codexCommand() {
  return process.env.CODEX_BIN || "codex";
}

export function createCodexEnvironment(config: RunConfig, safeId: string) {
  const root = mkdtempSync(join(tmpdir(), `clanker-codex-home-${safeId}-`));
  const home = join(root, "home");
  const codexHome = join(root, "codex");
  mkdirSync(home, { recursive: true });
  mkdirSync(codexHome, { recursive: true });

  const authPath = join(
    process.env.CODEX_HOME || join(process.env.HOME || "", ".codex"),
    "auth.json",
  );
  if (existsSync(authPath)) {
    symlinkSync(authPath, join(codexHome, "auth.json"));
  }

  if (config !== "without_mcp") {
    const skillsDir = join(codexHome, "skills");
    mkdirSync(skillsDir, { recursive: true });
    cpSync(
      join(repoRoot, "packages/cli/skills/clankeroverflow-mcp"),
      join(skillsDir, "clankeroverflow-mcp"),
      {
        recursive: true,
      },
    );
  }

  return {
    root,
    home,
    codexHome,
  };
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

function workspaceForScenario(options: RecordOptions, scenario: Scenario, safeId: string) {
  if (scenario.task_type !== "debug_workspace") {
    return mkdtempSync(join(tmpdir(), "clanker-codex-eval-workspace-"));
  }
  if (!scenario.workspace_fixture) {
    throw new Error(`Scenario ${scenario.id} is missing workspace_fixture`);
  }
  const source = join(options.workspaceDir, "workspace-fixtures", scenario.workspace_fixture);
  if (!existsSync(source)) throw new Error(`Missing workspace fixture ${source}`);
  const workspace = mkdtempSync(join(tmpdir(), `clanker-debug-${safeId}-`));
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

function runCodex(
  options: RecordOptions,
  config: RunConfig,
  scenario: Scenario,
  repetition: number,
  fixtureDbPath: string,
  traceDir: string,
) {
  const safeId = `${scenario.id}-${config}-r${repetition}`;
  const finalPath = join(traceDir, `${safeId}.final.md`);
  const eventsPath = join(traceDir, `${safeId}.events.jsonl`);
  const stderrPath = join(traceDir, `${safeId}.stderr.log`);
  const prompt = evalPrompt(scenario, config);
  const workspacePath = workspaceForScenario(options, scenario, safeId);
  const codexEnvironment = createCodexEnvironment(config, safeId);
  const beforeHashes = fileHashes(workspacePath);
  const args = codexArgs(options, config, finalPath, prompt, workspacePath);
  args.splice(
    args.length - 1,
    0,
    "-c",
    'mcp_servers.clankeroverflow.env.CLANKER_MODE="local"',
    "-c",
    `mcp_servers.clankeroverflow.env.CLANKER_LOCAL_DB="${fixtureDbPath.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
    "-c",
    'mcp_servers.clankeroverflow.env.CLANKER_LOCAL_SEMANTIC="0"',
  );
  const tempWorkspace = args[args.indexOf("-C") + 1]!;
  const env = {
    ...process.env,
    HOME: codexEnvironment.home,
    CODEX_HOME: codexEnvironment.codexHome,
    CLANKER_MODE: "local",
    CLANKER_LOCAL_DB: fixtureDbPath,
    CLANKER_LOCAL_SEMANTIC: "0",
  };

  const startedAt = Date.now();
  const result = spawnSync(codexCommand(), args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    input: "",
    timeout: options.timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  const elapsedMs = Date.now() - startedAt;

  writeFileSync(eventsPath, result.stdout ?? "");
  writeFileSync(stderrPath, result.stderr ?? "");
  const afterHashes = fileHashes(workspacePath);
  const verification = verifyWorkspace(scenario, options.workspaceDir, workspacePath);
  if (!options.keepTemp) rmSync(tempWorkspace, { recursive: true, force: true });
  rmSync(codexEnvironment.root, { recursive: true, force: true });

  const finalAnswer = (() => {
    try {
      return readFileSync(finalPath, "utf8").trim();
    } catch {
      return "";
    }
  })();
  const toolCalls = parseToolCalls(eventsPath);
  const usage = parseUsage(eventsPath, elapsedMs);

  if (result.status !== 0) {
    const stderrExcerpt = (result.stderr ?? "").split(/\r?\n/).slice(-12).join("\n").trim();
    const eventErrors = eventErrorMessages(eventsPath).join("\n").trim();
    const spawnError = result.error ? `${result.error.name}: ${result.error.message}` : "";
    const errorText = [spawnError, eventErrors, stderrExcerpt].filter(Boolean).join("\n");
    return {
      scenario_id: scenario.id,
      config,
      repetition,
      status: "failed",
      error: errorText,
      transcript: `Codex exec failed with status ${result.status ?? "unknown"}.\n${errorText}`,
      usage,
      cost_estimate: null,
      tool_calls: toolCalls,
      search_query: firstSearchQuery(toolCalls),
      returned_solution_ids: returnedSolutionIds(toolCalls),
      logged_solution_ids: loggedSolutionIds(toolCalls),
      workspace_path: options.keepTemp ? workspacePath : undefined,
      ...verification,
      changed_files: changedFiles(beforeHashes, afterHashes),
      final_answer: finalAnswer || `Codex exec failed with status ${result.status ?? "unknown"}.`,
    } satisfies EvalRun;
  }

  return {
    scenario_id: scenario.id,
    config,
    repetition,
    status: "completed",
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
    final_answer: finalAnswer,
  } satisfies EvalRun;
}

function parseArgs(argv: string[]): RecordOptions {
  const workspaceDefault = resolve(process.cwd(), "clankeroverflow-mcp-workspace", "product-proof");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options: RecordOptions = {
    workspaceDir: workspaceDefault,
    outputPath: join(workspaceDefault, "runs", `codex-real-${stamp}.json`),
    scenarios: [],
    repetitions: 1,
    reasoningEffort: "low",
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
      case "--reasoning-effort":
        options.reasoningEffort = next();
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
    run && run.status !== "failed" && !run.final_answer.startsWith("Codex exec failed"),
  );
}

export function isUsageLimitRun(run: EvalRun | undefined) {
  const text = [run?.error, run?.transcript, run?.final_answer].filter(Boolean).join("\n");
  return /usage limit|try again at/i.test(text);
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
  } else if (config === "learn_then_reuse_pass2") {
    // Keep the DB produced by pass 1 so pass 2 can retrieve the newly logged solution.
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
        const run = runCodex(options, config, scenario, repetition, fixtureDbPath, traceDir);
        runMap.set(key, run);
        const runs = runOrder.flatMap((shape) => {
          const run = runMap.get(runKey(shape));
          return run ? [run] : [];
        });
        const partial: RunsFile = {
          metadata: {
            name: "real paired Codex runs",
            sample: false,
            agent: "codex",
            model: options.model ?? "configured-default",
            created_at: new Date().toISOString(),
            notes: `Partial/in-progress safe file. Reasoning effort: ${options.reasoningEffort}.`,
          },
          runs,
          pairwise_reviews: [],
        };
        write(options.outputPath, `${JSON.stringify(partial, null, 2)}\n`);
        formatGeneratedJson(options.outputPath);
        if (isUsageLimitRun(run)) {
          throw new Error(
            `Codex usage limit hit after ${scenario.id} ${config} repetition ${repetition}. Partial run file saved to ${options.outputPath}; rerun with --resume-from ${options.outputPath} after the reset.`,
          );
        }
      }
    }
  }

  const runs = runOrder.flatMap((shape) => {
    const run = runMap.get(runKey(shape));
    return run ? [run] : [];
  });
  const output: RunsFile = {
    metadata: {
      name: "real paired Codex runs",
      sample: false,
      agent: "codex",
      model: options.model ?? "configured-default",
      created_at: new Date().toISOString(),
      notes: `Reasoning effort: ${options.reasoningEffort}. Per-run fixture DBs live under ${traceDir}.`,
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
