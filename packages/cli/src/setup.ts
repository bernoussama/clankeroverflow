import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { promisify } from "node:util";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@clankeroverflow/api/routers/index";
import pc from "picocolors";
import yoctoSpinner from "yocto-spinner";
import {
  resolveConfig,
  toPersistedConfig,
  writePersistedConfig,
  type ClankerMode,
} from "./mcp/config";
import { defaultLocalModelPath } from "./mcp/local-semantic";

const execFileAsync = promisify(execFile);
const MCP_NAME = "clankeroverflow";
const CLAUDE_PLUGIN = "clankeroverflow@claude-plugin";
const DEFAULT_SERVER_URL = "https://api.clankeroverflow.com";
const DEVICE_CLIENT_ID = "clankeroverflow-cli";
const MCP_COMMAND = ["npx", "-y", "@clankeroverflow/cli", "mcp"] as const;
const AGENTS = ["codex", "claude", "opencode", "pi", "cursor"] as const;

export type Agent = (typeof AGENTS)[number];
export type SkillSelection = "mcp" | "cli" | "both";

type CommandResult = { stdout: string; stderr: string };
type SetupResult = {
  agent: string;
  status: "configured" | "removed" | "skipped" | "failed";
  detail: string;
};

export type SetupOptions = {
  agents?: Agent[];
  apiKey?: string;
  noApiKey?: boolean;
  claudePlugin?: string;
  dryRun?: boolean;
  env?: Partial<NodeJS.ProcessEnv>;
  home?: string;
  local?: boolean;
  mode?: ClankerMode;
  localDb?: string;
  localModelPath?: string;
  localSemantic?: boolean;
  packageRoot?: string;
  serverUrl?: string;
  skill?: SkillSelection;
  targets?: string[];
  uninstall?: boolean;
};

export type SetupDependencies = {
  commandExists?: (command: string, env: Partial<NodeJS.ProcessEnv>) => Promise<boolean>;
  fetch?: typeof fetch;
  openBrowser?: (url: string) => Promise<void>;
  promptConfirm?: (message: string) => Promise<boolean>;
  promptSecret?: (message: string) => Promise<string>;
  runCommand?: (command: string, args: string[]) => Promise<CommandResult>;
  sleep?: (ms: number) => Promise<void>;
  stdinIsTTY?: boolean;
};

type Context = {
  env: Partial<NodeJS.ProcessEnv>;
  home: string;
  packageRoot: string;
  serverUrl: string;
  apiKey?: string;
  dryRun: boolean;
  local: boolean;
  localDb?: string;
  localModelPath?: string;
  localSemantic: boolean;
  runCommand: NonNullable<SetupDependencies["runCommand"]>;
};

async function pathExists(target: string) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function defaultCommandExists(command: string, env: Partial<NodeJS.ProcessEnv>) {
  for (const dir of env.PATH?.split(path.delimiter) ?? []) {
    try {
      await access(path.join(dir, command), constants.X_OK);
      return true;
    } catch {
      // Keep looking through PATH.
    }
  }
  return false;
}

async function defaultRunCommand(command: string, args: string[]) {
  try {
    return await execFileAsync(command, args);
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw Object.assign(new Error(failure.stderr?.trim() || failure.message), {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    });
  }
}

function spawnDetached(command: string, args: string[]) {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {
    // Browser opening is optional; the login URL is printed for manual use.
  });
  child.unref();
}

async function defaultOpenBrowser(url: string) {
  if (process.platform === "darwin") {
    spawnDetached("open", [url]);
    return;
  }
  if (process.platform === "win32") {
    spawnDetached("cmd", ["/c", "start", "", url]);
    return;
  }
  spawnDetached("xdg-open", [url]);
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function promptConfirm(message: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} [Y/n] `);
  rl.close();
  return !/^n(?:o)?$/i.test(answer.trim());
}

async function promptSecret(message: string) {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answerPromise = rl.question(`${message}: `);
  muted = true;
  const answer = await answerPromise;
  muted = false;
  rl.close();
  process.stdout.write("\n");
  return answer.trim();
}

export function getOpenCodeConfigPath(home: string, env: Partial<NodeJS.ProcessEnv>) {
  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "opencode", "opencode.json");
}

export function getCursorConfigPath(home: string) {
  return path.join(home, ".cursor", "mcp.json");
}

export async function detectAgents(
  home: string,
  env: Partial<NodeJS.ProcessEnv>,
  commandExists: NonNullable<SetupDependencies["commandExists"]> = defaultCommandExists,
) {
  const checks: Record<Agent, string | null> = {
    codex: path.join(home, ".codex"),
    claude: path.join(home, ".claude"),
    opencode: path.dirname(getOpenCodeConfigPath(home, env)),
    cursor: path.join(home, ".cursor"),
    pi: null,
  };
  const detected: Agent[] = [];
  for (const agent of AGENTS) {
    if (
      (await commandExists(agent, env)) ||
      (checks[agent] && (await pathExists(checks[agent]!)))
    ) {
      detected.push(agent);
    }
  }
  return detected;
}

function createMcpEnv(ctx: Context) {
  if (ctx.local) return {};
  return ctx.apiKey ? { CLANKER_API_KEY: ctx.apiKey } : {};
}

async function readJsonObject(filePath: string) {
  if (!(await pathExists(filePath))) return {};
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, any>;
  } catch {
    throw new Error(`Refusing to overwrite invalid JSON in ${filePath}`);
  }
}

async function writeJsonObject(filePath: string, value: Record<string, any>, dryRun: boolean) {
  if (dryRun) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function configureOpenCode(ctx: Context, uninstall: boolean) {
  const configPath = getOpenCodeConfigPath(ctx.home, ctx.env);
  const config = await readJsonObject(configPath);
  const mcp = { ...config.mcp };
  if (uninstall) delete mcp[MCP_NAME];
  else {
    mcp[MCP_NAME] = {
      type: "local",
      command: [...MCP_COMMAND],
      environment: createMcpEnv(ctx),
      enabled: true,
    };
  }
  if (Object.keys(mcp).length) config.mcp = mcp;
  else delete config.mcp;
  await writeJsonObject(configPath, config, ctx.dryRun);
}

async function configureCursor(ctx: Context, uninstall: boolean) {
  const configPath = getCursorConfigPath(ctx.home);
  const config = await readJsonObject(configPath);
  const mcpServers = { ...config.mcpServers };
  if (uninstall) delete mcpServers[MCP_NAME];
  else {
    mcpServers[MCP_NAME] = {
      command: MCP_COMMAND[0],
      args: MCP_COMMAND.slice(1),
      env: createMcpEnv(ctx),
    };
  }
  if (Object.keys(mcpServers).length) config.mcpServers = mcpServers;
  else delete config.mcpServers;
  await writeJsonObject(configPath, config, ctx.dryRun);
}

function envArgs(ctx: Context) {
  return Object.entries(createMcpEnv(ctx)).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
}

async function configureCodex(ctx: Context, uninstall: boolean) {
  if (ctx.dryRun) return;
  await ctx.runCommand("codex", ["mcp", "remove", MCP_NAME]).catch(() => undefined);
  if (!uninstall) {
    await ctx.runCommand("codex", ["mcp", "add", MCP_NAME, ...envArgs(ctx), "--", ...MCP_COMMAND]);
  }
}

function isMissingClaudePlugin(error: unknown) {
  return /(not found|unknown plugin|does not exist|no plugin)/i.test(
    String((error as Error)?.message ?? error),
  );
}

async function configureClaude(ctx: Context, uninstall: boolean, plugin: string) {
  if (ctx.dryRun)
    return uninstall ? "plugin and MCP removal planned" : "plugin installation planned";
  if (uninstall) {
    await ctx.runCommand("claude", ["plugin", "uninstall", plugin]).catch(() => undefined);
    await ctx
      .runCommand("claude", ["mcp", "remove", "--scope", "user", MCP_NAME])
      .catch(() => undefined);
    return "plugin and MCP removed";
  }
  try {
    await ctx.runCommand("claude", ["plugin", "install", "--scope", "user", plugin]);
    return "marketplace plugin installed; export CLANKER_API_KEY in your shell for plugin authentication";
  } catch (error) {
    if (!isMissingClaudePlugin(error)) throw error;
  }
  await ctx
    .runCommand("claude", ["mcp", "remove", "--scope", "user", MCP_NAME])
    .catch(() => undefined);
  await ctx.runCommand("claude", [
    "mcp",
    "add",
    "--scope",
    "user",
    MCP_NAME,
    ...envArgs(ctx),
    "--",
    ...MCP_COMMAND,
  ]);
  return "marketplace plugin unavailable; standalone MCP configured";
}

async function copySkill(
  ctx: Context,
  skill: "clankeroverflow-mcp" | "clankeroverflow-cli",
  skillsDir: string,
) {
  const destination = path.join(skillsDir, skill);
  if (ctx.dryRun) return destination;
  await rm(destination, { recursive: true, force: true });
  await mkdir(skillsDir, { recursive: true });
  await cp(path.join(ctx.packageRoot, "skills", skill), destination, {
    recursive: true,
    force: true,
  });
  return destination;
}

async function removeSkill(ctx: Context, skill: string, skillsDir: string) {
  if (!ctx.dryRun) await rm(path.join(skillsDir, skill), { recursive: true, force: true });
}

async function readConfiguredApiKey(home: string, env: Partial<NodeJS.ProcessEnv>) {
  for (const [filePath, keys] of [
    [getOpenCodeConfigPath(home, env), ["mcp", MCP_NAME, "environment", "CLANKER_API_KEY"]],
    [getCursorConfigPath(home), ["mcpServers", MCP_NAME, "env", "CLANKER_API_KEY"]],
  ] as const) {
    try {
      let value: any = await readJsonObject(filePath);
      for (const key of keys) value = value?.[key];
      if (typeof value === "string" && value) return value;
    } catch {
      // Invalid JSON will be reported later if this config is selected for modification.
    }
  }
}

async function validateApiKey(apiKey: string, serverUrl: string, fetchImpl: typeof fetch) {
  const input = encodeURIComponent(JSON.stringify({ "0": { json: null } }));
  const response = await fetchImpl(`${serverUrl}/trpc/apiKeyCheck?batch=1&input=${input}`, {
    headers: { "x-clanker-api-key": apiKey },
  });
  if (!response.ok) return false;
  const body = (await response.json()) as Array<{ result?: { data?: unknown } }>;
  return Array.isArray(body) && body[0]?.result?.data === true;
}

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
};

type DeviceTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function parseJsonResponse<T>(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `Request failed with ${response.status}`);
  }
}

async function requestDeviceCode(serverUrl: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${serverUrl}/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: DEVICE_CLIENT_ID,
      scope: "openid profile email",
    }),
  });
  const body = await parseJsonResponse<
    DeviceCodeResponse & {
      error?: string;
      error_description?: string;
    }
  >(response);
  if (!response.ok) {
    throw new Error(body.error_description || body.error || "Unable to start browser login.");
  }
  return body;
}

async function requestDeviceToken(serverUrl: string, deviceCode: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${serverUrl}/auth/device/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: DEVICE_CLIENT_ID,
    }),
  });
  return parseJsonResponse<DeviceTokenResponse>(response);
}

async function exchangeDeviceToken(
  serverUrl: string,
  accessToken: string,
  clientName: string,
  fetchImpl: typeof fetch,
) {
  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${serverUrl}/trpc`,
        fetch(url, options) {
          const { signal: _signal, ...rest } = options ?? {};
          return fetchImpl(url, rest);
        },
      }),
    ],
  });
  const created = await trpc.cliAuth.exchangeDeviceToken.mutate({
    accessToken,
    clientName,
  });
  return created.key;
}

async function resolveBrowserApiKey(
  serverUrl: string,
  deps: SetupDependencies,
  fetchImpl: typeof fetch,
) {
  const device = await requestDeviceCode(serverUrl, fetchImpl);
  const url = device.verification_uri_complete || device.verification_uri;
  console.log(`\n${pc.cyan("ℹ")} Opening browser for ClankerOverflow login: ${pc.underline(url)}`);
  console.log(
    `${pc.cyan("ℹ")} If the browser does not open, visit: ${pc.cyan(pc.underline(url))}\n`,
  );

  await (deps.openBrowser ?? defaultOpenBrowser)(url);

  const sleep = deps.sleep ?? defaultSleep;
  let pollIntervalSeconds = device.interval ?? 5;
  const expiresAt = Date.now() + device.expires_in * 1000;

  const spinner = yoctoSpinner({ text: "Waiting for browser authorization..." }).start();

  try {
    while (Date.now() < expiresAt) {
      await sleep(pollIntervalSeconds * 1000);
      const token = await requestDeviceToken(serverUrl, device.device_code, fetchImpl);

      if (token.access_token) {
        spinner.success("Authorized successfully!");
        const clientName = `CLI setup - ${hostname()}`;
        return exchangeDeviceToken(serverUrl, token.access_token, clientName, fetchImpl);
      }

      if (token.error === "authorization_pending") continue;
      if (token.error === "slow_down") {
        pollIntervalSeconds += 5;
        continue;
      }
      if (token.error === "access_denied") {
        throw new Error("Browser login was denied.");
      }
      if (token.error === "expired_token") {
        throw new Error("Browser login expired. Run setup again to retry.");
      }
      throw new Error(token.error_description || token.error || "Browser login failed.");
    }

    throw new Error("Browser login expired. Run setup again to retry.");
  } catch (error) {
    spinner.error((error as Error).message);
    throw error;
  }
}

async function resolveApiKey(
  options: SetupOptions,
  deps: SetupDependencies,
  home: string,
  env: Partial<NodeJS.ProcessEnv>,
) {
  if (options.local) return undefined;
  if (options.noApiKey) return undefined;
  const fetchImpl = deps.fetch ?? fetch;
  if (options.apiKey) {
    if (
      !(await validateApiKey(options.apiKey, options.serverUrl ?? DEFAULT_SERVER_URL, fetchImpl))
    ) {
      throw new Error("The supplied API key is invalid.");
    }
    return options.apiKey;
  }
  const existing = await readConfiguredApiKey(home, env);
  const isInteractive = deps.stdinIsTTY ?? Boolean(process.stdin.isTTY);
  if (!isInteractive) {
    throw new Error("Non-interactive setup requires --api-key <key> or --no-api-key.");
  }
  if (
    existing &&
    (await (deps.promptConfirm ?? promptConfirm)("Keep the existing configured API key?"))
  )
    return existing;
  console.warn(
    pc.yellow(pc.bold("⚠️  Warning: ")) +
      "the API key will be stored as plaintext in configured agent MCP files.",
  );
  if (await (deps.promptConfirm ?? promptConfirm)("Open browser to sign in automatically?")) {
    try {
      const apiKey = await resolveBrowserApiKey(
        options.serverUrl ?? DEFAULT_SERVER_URL,
        deps,
        fetchImpl,
      );
      if (await validateApiKey(apiKey, options.serverUrl ?? DEFAULT_SERVER_URL, fetchImpl)) {
        return apiKey;
      }
      console.warn(
        pc.yellow(pc.bold("⚠️  Warning: ")) +
          "The browser login returned an invalid API key. Falling back to manual setup.",
      );
    } catch (error) {
      console.warn(
        pc.yellow(pc.bold("⚠️  Warning: ")) + `Browser login failed: ${(error as Error).message}`,
      );
    }
  }
  while (true) {
    const apiKey = await (deps.promptSecret ?? promptSecret)(
      "Paste your ClankerOverflow API key, or press Enter to skip",
    );
    if (!apiKey) return undefined;
    if (await validateApiKey(apiKey, options.serverUrl ?? DEFAULT_SERVER_URL, fetchImpl))
      return apiKey;
    console.warn(
      pc.yellow(pc.bold("⚠️  Warning: ")) +
        "That API key is invalid. Try again or press Enter to skip authentication.",
    );
  }
}

function parseAgents(agents: Agent[] | undefined) {
  if (!agents) return undefined;
  const invalid = agents.filter((agent) => !AGENTS.includes(agent));
  if (invalid.length) throw new Error(`Unsupported agent: ${invalid.join(", ")}`);
  return [...new Set(agents)];
}

function validateServerUrl(serverUrl: string) {
  try {
    const parsed = new URL(serverUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid --server-url: ${serverUrl}`);
  }
}

function validateSkillSelection(skill: SkillSelection | undefined) {
  if (skill && !["mcp", "cli", "both"].includes(skill)) {
    throw new Error(`Invalid --skill: ${skill}. Use mcp, cli, or both.`);
  }
  return skill;
}

async function resolveSetupMode(options: SetupOptions, deps: SetupDependencies) {
  if (options.mode && !["local", "remote"].includes(options.mode)) {
    throw new Error(`Invalid --mode: ${options.mode}. Use local or remote.`);
  }
  if (options.mode && options.local && options.mode !== "local") {
    throw new Error("--local cannot be combined with --mode remote.");
  }
  if (options.mode) return options.mode;
  if (options.local || options.localSemantic) return "local" as const;
  if (options.uninstall) return "remote" as const;

  const isInteractive = deps.stdinIsTTY ?? Boolean(process.stdin.isTTY);
  if (!isInteractive) {
    throw new Error("Non-interactive setup requires --mode local|remote (or --local).");
  }
  const useLocal = await (deps.promptConfirm ?? promptConfirm)(
    "Use private local storage instead of the hosted service?",
  );
  return useLocal ? ("local" as const) : ("remote" as const);
}

export async function setupAgents(options: SetupOptions = {}, deps: SetupDependencies = {}) {
  const env = options.env ?? process.env;
  const home = options.home ?? env.HOME ?? homedir();
  const agents = parseAgents(options.agents) ?? (await detectAgents(home, env, deps.commandExists));
  if (!agents.length) {
    throw new Error("No supported agents detected. Use --agent <name> to force configuration.");
  }
  const packageRoot =
    options.packageRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const mode = await resolveSetupMode(options, deps);
  const configEnv = {
    ...env,
    ...(options.localDb ? { CLANKER_LOCAL_DB: options.localDb } : {}),
    ...(options.localModelPath ? { CLANKER_LOCAL_MODEL_PATH: options.localModelPath } : {}),
    ...(options.localSemantic !== undefined
      ? { CLANKER_LOCAL_SEMANTIC: options.localSemantic ? "1" : "0" }
      : {}),
    ...(options.serverUrl ? { CLANKER_SERVER_URL: options.serverUrl } : {}),
  } as NodeJS.ProcessEnv;
  const resolvedConfig = options.uninstall ? undefined : resolveConfig(configEnv, { home });
  const serverUrl = validateServerUrl(
    options.serverUrl ?? resolvedConfig?.serverUrl ?? DEFAULT_SERVER_URL,
  );
  const skill = validateSkillSelection(options.skill);
  const ctx: Context = {
    env,
    home,
    packageRoot,
    serverUrl,
    apiKey: options.uninstall
      ? undefined
      : await resolveApiKey({ ...options, local: mode === "local", serverUrl }, deps, home, env),
    dryRun: Boolean(options.dryRun),
    local: mode === "local",
    localDb: options.localDb ?? resolvedConfig?.localDbPath,
    localModelPath:
      options.localModelPath ??
      resolvedConfig?.localSemantic.modelPath ??
      (options.localSemantic ? defaultLocalModelPath(env as NodeJS.ProcessEnv) : undefined),
    localSemantic: options.localSemantic ?? resolvedConfig?.localSemantic.enabled ?? true,
    runCommand: deps.runCommand ?? defaultRunCommand,
  };
  const results: SetupResult[] = [];
  const uninstall = Boolean(options.uninstall);
  const sharedSkillsDir = path.join(home, ".agents", "skills");
  const hasMcpSharedAgent = agents.some((agent) => ["codex", "opencode", "cursor"].includes(agent));

  if (!uninstall && resolvedConfig) {
    const persisted = toPersistedConfig(resolvedConfig, mode);
    persisted.local.databasePath = ctx.localDb ?? persisted.local.databasePath;
    persisted.local.semantic = ctx.localSemantic;
    persisted.local.modelPath = ctx.localModelPath ?? persisted.local.modelPath;
    persisted.remote.serverUrl = serverUrl;
    const configPath = ctx.dryRun
      ? resolvedConfig.configPath
      : await writePersistedConfig(persisted, env as NodeJS.ProcessEnv, { home });
    results.push({
      agent: "configuration",
      status: "configured",
      detail: `${mode} mode at ${configPath}`,
    });
  }

  try {
    if (uninstall) {
      await removeSkill(ctx, "clankeroverflow-mcp", sharedSkillsDir);
      await removeSkill(ctx, "clankeroverflow-cli", sharedSkillsDir);
    } else {
      if (hasMcpSharedAgent) await copySkill(ctx, "clankeroverflow-mcp", sharedSkillsDir);
      if (agents.includes("pi")) await copySkill(ctx, "clankeroverflow-cli", sharedSkillsDir);
    }
    if (hasMcpSharedAgent || agents.includes("pi")) {
      results.push({
        agent: "shared skills",
        status: uninstall ? "removed" : "configured",
        detail: sharedSkillsDir,
      });
    }
  } catch (error) {
    results.push({
      agent: "shared skills",
      status: "failed",
      detail: String((error as Error).message),
    });
  }

  if (agents.includes("claude")) {
    const claudeSkills = path.join(home, ".claude", "skills");
    try {
      if (uninstall) await removeSkill(ctx, "clankeroverflow-mcp", claudeSkills);
      else await copySkill(ctx, "clankeroverflow-mcp", claudeSkills);
      const detail = await configureClaude(ctx, uninstall, options.claudePlugin ?? CLAUDE_PLUGIN);
      results.push({ agent: "claude", status: uninstall ? "removed" : "configured", detail });
    } catch (error) {
      results.push({ agent: "claude", status: "failed", detail: String((error as Error).message) });
    }
  }

  for (const agent of agents) {
    if (!["codex", "opencode", "cursor"].includes(agent)) continue;
    try {
      if (agent === "codex") await configureCodex(ctx, uninstall);
      if (agent === "opencode") await configureOpenCode(ctx, uninstall);
      if (agent === "cursor") await configureCursor(ctx, uninstall);
      results.push({
        agent,
        status: uninstall ? "removed" : "configured",
        detail: "MCP configuration updated",
      });
    } catch (error) {
      results.push({ agent, status: "failed", detail: String((error as Error).message) });
    }
  }

  const legacyOpenCodeSkills = path.join(path.dirname(getOpenCodeConfigPath(home, env)), "skills");
  if ((agents.includes("opencode") || uninstall) && !ctx.dryRun) {
    await rm(path.join(legacyOpenCodeSkills, "clankeroverflow-mcp"), {
      recursive: true,
      force: true,
    });
  }

  for (const target of options.targets ?? []) {
    try {
      const selection = skill ?? "mcp";
      if (uninstall || selection === "mcp" || selection === "both") {
        if (uninstall) await removeSkill(ctx, "clankeroverflow-mcp", target);
        else await copySkill(ctx, "clankeroverflow-mcp", target);
      }
      if (uninstall || selection === "cli" || selection === "both") {
        if (uninstall) await removeSkill(ctx, "clankeroverflow-cli", target);
        else await copySkill(ctx, "clankeroverflow-cli", target);
      }
      results.push({
        agent: `target ${target}`,
        status: uninstall ? "removed" : "configured",
        detail: selection,
      });
    } catch (error) {
      results.push({
        agent: `target ${target}`,
        status: "failed",
        detail: String((error as Error).message),
      });
    }
  }

  if (!uninstall && agents.includes("pi") && ctx.apiKey) {
    results.push({
      agent: "pi",
      status: "configured",
      detail: "CLI skill installed; export CLANKER_API_KEY in your shell",
    });
  }
  return results;
}

export function hasSetupFailures(results: SetupResult[]) {
  return results.some((result) => result.status === "failed");
}
