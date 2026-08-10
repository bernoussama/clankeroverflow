import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliPath = join(root, "packages/cli/dist/index.mjs");

function textFromTool(result) {
  return (result.content ?? [])
    .filter((entry) => entry.type === "text")
    .map((entry) => entry.text)
    .join("\n");
}

async function runProcess(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const exitCode = await new Promise((resolveProcess, rejectProcess) => {
    child.on("error", rejectProcess);
    child.on("exit", (code) => resolveProcess(code ?? 0));
  });
  if (exitCode !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (${exitCode})\n${stderr}\n${stdout}`);
  return { stdout, stderr };
}

async function runCli(args, env) {
  return (await runProcess(process.execPath, [cliPath, ...args], { cwd: root, env })).stdout;
}

const tempRoot = await mkdtemp(join(tmpdir(), "clanker-local-e2e-"));
try {
  const home = join(tempRoot, "home");
  const configRoot = join(tempRoot, "config");
  const cacheRoot = join(tempRoot, "cache");
  const configPath = join(configRoot, "clankeroverflow", "config.json");
  const modelPath = join(cacheRoot, "clankeroverflow", "models", "bge-small-en-v1.5-q8_0.gguf");
  const databasePath = join(tempRoot, "solutions.sqlite");
  await mkdir(dirname(configPath), { recursive: true });
  await mkdir(dirname(modelPath), { recursive: true });
  await writeFile(modelPath, "legacy managed model");
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        version: 1,
        mode: "local",
        local: {
          databasePath,
          semantic: true,
          modelId: "bge-small-en-v1.5-q8_0",
          modelPath,
          dimensions: 384,
        },
        remote: { serverUrl: "http://127.0.0.1:9", webUrl: "http://127.0.0.1:9" },
      },
      null,
      2,
    )}\n`,
  );
  const env = {
    ...process.env,
    HOME: home,
    NO_COLOR: "1",
    XDG_CONFIG_HOME: configRoot,
    XDG_CACHE_HOME: cacheRoot,
    CLANKER_SERVER_URL: "http://127.0.0.1:9",
    CLANKER_WEB_URL: "http://127.0.0.1:9",
    CLANKER_API_KEY: "",
  };

  const configOutput = await runCli(["config", "show", "--json"], env);
  assert.equal(JSON.parse(configOutput).mode, "local");
  assert.equal(JSON.parse(await readFile(configPath, "utf8")).version, 2);
  await assert.rejects(readFile(modelPath), { code: "ENOENT" });

  const logOutput = await runCli(
    [
      "log",
      "--problem",
      "Vite dev server exits with EADDRINUSE when port 5173 is already bound",
      "--solution",
      "Stop the owning process or select a free port.",
      "--tags",
      "vite,ports",
    ],
    env,
  );
  assert.match(logOutput, /Solution logged locally: [0-9a-f-]{36}/);

  const exact = await runCli(["search", "EADDRINUSE", "--limit", "1"], env);
  assert.match(exact, /Vite dev server exits with EADDRINUSE/);
  assert.match(exact, /keyword exact returned 1/);
  const tiered = await runCli(["search", "EADDRINUSE unmatchedtoken", "--limit", "1"], env);
  assert.match(tiered, /keyword exact returned 0; keyword tiered returned 1/);
  assert.match(tiered, /Vite dev server exits with EADDRINUSE/);

  const status = JSON.parse(await runCli(["local", "status", "--json"], env));
  assert.equal(status.mode, "local");
  assert.equal(status.status.totalSolutions, 1);
  assert.equal(status.status.fts5, true);
  assert.equal("semantic" in status.status, false);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, "mcp"],
    cwd: root,
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "clankeroverflow-local-e2e", version: "2.0.0" });
  await client.connect(transport, { timeout: 30_000 });
  try {
    const result = await client.callTool({
      name: "search_solutions",
      arguments: { query: "EADDRINUSE unmatchedtoken", limit: 1 },
    });
    const text = textFromTool(result);
    assert.match(text, /keyword exact returned 0; keyword tiered returned 1/);
    assert.match(text, /Vite dev server exits with EADDRINUSE/);
    const mcpStatus = await client.callTool({ name: "clanker_status", arguments: {} });
    assert.equal(mcpStatus.structuredContent?.status?.totalSolutions, 1);
    assert.equal("semantic" in (mcpStatus.structuredContent ?? {}), false);
  } finally {
    await client.close();
  }
  console.log("[local-mode-e2e] passed");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
