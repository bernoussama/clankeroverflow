import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliPath = join(root, "packages/cli/dist/index.mjs");

const fixtures = {
  vite: {
    problem: "Vite dev server exits with EADDRINUSE when port 5173 is already bound",
    solution: "Find the process that owns the port and stop it, or start Vite on a different port.",
    tags: "vite,dev-server,ports",
  },
  playwright: {
    problem: "Playwright browser install is missing on Debian CI",
    solution:
      "Run playwright install --with-deps chromium so browsers and operating system libraries exist before tests.",
    tags: "playwright,ci,browser",
  },
  prisma: {
    problem: "Prisma migration shadow database permission denied",
    solution:
      "Grant create database permission for the test user or configure a dedicated shadow database URL.",
    tags: "prisma,postgres,migrations",
  },
  longPending: {
    problem: "Local embed handles long pending solution text without context overflow",
    solution: [
      "When a local solution is much longer than the embedding model context, split the tokenized text into safe windows.",
      "Embed each window with the same local GGUF model, weight each vector by the chunk token count, average the vectors, and normalize the stored result.",
      "This prevents node-llama-cpp from throwing Input is longer than the context size while still preserving information from the whole solution.",
    ]
      .join(" ")
      .repeat(30),
    tags: "clankeroverflow,local,semantic,long-embedding",
  },
  longImmediate: {
    problem: "Local log immediately indexes long semantic solution text",
    solution: [
      "The local log command should use the same chunked embedding path as local embed.",
      "Long entries must remain synchronously searchable after logging when local semantic search is enabled.",
      "No warning should be emitted, no pending embedding should remain, and semantic search should be able to retrieve the entry.",
    ]
      .join(" ")
      .repeat(30),
    tags: "clankeroverflow,local,semantic,immediate-indexing",
  },
};

function logStep(message) {
  console.log(`[local-mode-e2e] ${message}`);
}

function textFromTool(result) {
  return (result.content ?? [])
    .filter((entry) => entry.type === "text")
    .map((entry) => entry.text)
    .join("\n");
}

function firstProblem(output) {
  return output.match(/^# Problem: (?<problem>.+?) \(Score: /m)?.groups?.problem ?? "";
}

function assertTopProblem(output, expectedProblem, label) {
  assert.equal(
    firstProblem(output),
    expectedProblem,
    `${label} should return the expected top problem.\n\n${output}`,
  );
}

async function runCli(args, env) {
  const result = await runProcess(process.execPath, [cliPath, ...args], {
    cwd: root,
    env,
  });
  return result.stdout;
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
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exitCode = await new Promise((resolveProcess, rejectProcess) => {
    child.on("error", rejectProcess);
    child.on("exit", (code) => resolveProcess(code ?? 0));
  });

  if (exitCode !== 0) {
    throw new Error(
      [
        `Command failed with exit code ${exitCode}: ${command} ${args.join(" ")}`,
        stderr && `stderr:\n${stderr}`,
        stdout && `stdout:\n${stdout}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  return { stdout, stderr };
}

async function logDirectSolution(env, fixture) {
  const stdout = await runCli(
    ["log", "--problem", fixture.problem, "--solution", fixture.solution, "--tags", fixture.tags],
    env,
  );
  const id = stdout.match(/[0-9a-f-]{36}/)?.[0];
  assert.ok(id, `direct log output should contain a local UUID.\n\n${stdout}`);
  return id;
}

async function verifyDirectCli(env) {
  logStep("checking native semantic dependencies import");
  await import("sqlite-vec");
  await import("node-llama-cpp");

  logStep("logging direct CLI fixtures before embeddings are available");
  const semanticDisabledEnv = { ...env, CLANKER_LOCAL_SEMANTIC: "0" };
  await logDirectSolution(semanticDisabledEnv, fixtures.vite);
  await logDirectSolution(semanticDisabledEnv, fixtures.longPending);

  logStep("checking local semantic status before embedding pending direct logs");
  const pendingStatus = JSON.parse(await runCli(["local", "status", "--json"], env));
  assert.equal(pendingStatus.mode, "local");
  assert.equal(pendingStatus.semantic.enabled, true);
  assert.equal(pendingStatus.semantic.totalSolutions, 2);
  assert.equal(pendingStatus.semantic.embeddedSolutions, 0);
  assert.equal(pendingStatus.semantic.pendingEmbeddings, 2);
  assert.equal(pendingStatus.semantic.sqliteVecAvailable, true);
  assert.equal(pendingStatus.semantic.embedderAvailable, true);

  logStep("verifying direct keyword search works before local embeddings exist");
  const preEmbedKeyword = await runCli(
    ["search", "EADDRINUSE", "--mode", "keyword", "--limit", "1"],
    env,
  );
  assertTopProblem(preEmbedKeyword, fixtures.vite.problem, "pre-embed direct keyword search");

  logStep("downloading or checking the local embedding model and embedding pending solutions");
  const embedOutput = await runCli(["local", "embed"], env);
  assert.match(embedOutput, /Local embeddings ready/);
  assert.match(embedOutput, /2 solution\(s\) embedded/);

  logStep("verifying long pending solution was embedded without context overflow");
  const postLongEmbedStatus = JSON.parse(await runCli(["local", "status", "--json"], env));
  assert.equal(postLongEmbedStatus.semantic.embeddedSolutions, 2);
  assert.equal(postLongEmbedStatus.semantic.pendingEmbeddings, 0);
  const longPendingSemantic = await runCli(
    [
      "search",
      "context overflow chunked embedding average normalized vectors",
      "--mode",
      "semantic",
      "--limit",
      "1",
    ],
    env,
  );
  assertTopProblem(
    longPendingSemantic,
    fixtures.longPending.problem,
    "long pending semantic search",
  );

  logStep("logging direct CLI fixture solutions with immediate embeddings");
  await logDirectSolution(env, fixtures.playwright);
  await logDirectSolution(env, fixtures.prisma);

  logStep("logging long direct CLI solution with immediate chunked embedding");
  const longImmediateOutput = await runCli(
    [
      "log",
      "--problem",
      fixtures.longImmediate.problem,
      "--solution",
      fixtures.longImmediate.solution,
      "--tags",
      fixtures.longImmediate.tags,
    ],
    env,
  );
  assert.match(longImmediateOutput, /Solution logged locally: [0-9a-f-]{36}/);
  assert.doesNotMatch(longImmediateOutput, /local semantic indexing failed/i);

  logStep("checking local semantic status after direct logs");
  const status = JSON.parse(await runCli(["local", "status", "--json"], env));
  assert.equal(status.mode, "local");
  assert.equal(status.semantic.enabled, true);
  assert.equal(status.semantic.totalSolutions, 5);
  assert.equal(status.semantic.embeddedSolutions, 5);
  assert.equal(status.semantic.pendingEmbeddings, 0);
  assert.equal(status.semantic.staleEmbeddings, 0);
  assert.equal(status.semantic.modelValid, true);
  assert.equal(status.semantic.sqliteVecAvailable, true);
  assert.equal(status.semantic.embedderAvailable, true);

  logStep("verifying direct keyword search");
  const keyword = await runCli(["search", "EADDRINUSE", "--mode", "keyword", "--limit", "1"], env);
  assertTopProblem(keyword, fixtures.vite.problem, "direct keyword search");

  logStep("verifying direct semantic search");
  const semanticQuery = "address already occupied during frontend startup";
  const semantic = await runCli(
    ["search", semanticQuery, "--mode", "semantic", "--limit", "1"],
    env,
  );
  assertTopProblem(semantic, fixtures.vite.problem, "direct semantic search");

  logStep("verifying direct hybrid search");
  const hybrid = await runCli(["search", semanticQuery, "--mode", "hybrid", "--limit", "1"], env);
  assertTopProblem(hybrid, fixtures.vite.problem, "direct hybrid search");

  logStep("verifying direct auto fallback to hybrid");
  const auto = await runCli(["search", semanticQuery, "--limit", "1"], env);
  assert.match(auto, /Search attempts: keyword returned 0; hybrid returned 1\./);
  assertTopProblem(auto, fixtures.vite.problem, "direct auto search");

  logStep("verifying explicit local search works without CLANKER_MODE");
  const explicitLocalEnv = { ...env };
  delete explicitLocalEnv.CLANKER_MODE;
  const localKeyword = await runCli(
    ["local", "search", "immediate chunked embedding", "--mode", "keyword", "--limit", "1"],
    explicitLocalEnv,
  );
  assertTopProblem(localKeyword, fixtures.longImmediate.problem, "explicit local keyword search");

  logStep("verifying explicit local semantic search works without CLANKER_MODE");
  const localSemantic = await runCli(
    [
      "local",
      "search",
      "synchronously searchable after logging local semantic enabled",
      "--mode",
      "semantic",
      "--limit",
      "1",
    ],
    explicitLocalEnv,
  );
  assertTopProblem(localSemantic, fixtures.longImmediate.problem, "explicit local semantic search");
}

async function verifyMcp(env) {
  logStep("starting MCP server over stdio");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, "mcp"],
    cwd: root,
    env,
    stderr: "pipe",
  });
  const stderrChunks = [];
  transport.stderr?.setEncoding("utf8");
  transport.stderr?.on("data", (chunk) => {
    stderrChunks.push(chunk);
  });

  const client = new Client({ name: "clankeroverflow-local-e2e", version: "1.0.0" });
  await client.connect(transport, { timeout: 120_000 });

  try {
    logStep("logging an MCP fixture solution");
    const logResult = await client.callTool(
      {
        name: "log_solution",
        arguments: {
          problem: "Node test runner cannot resolve workspace package exports",
          solution:
            "Build the referenced workspace package first so package exports point at existing dist files.",
          tags: "node,pnpm,workspace",
        },
      },
      undefined,
      { timeout: 120_000 },
    );
    assert.match(textFromTool(logResult), /Solution logged locally: [0-9a-f-]{36}/);

    logStep("checking MCP local status");
    const statusResult = await client.callTool(
      { name: "clanker_status", arguments: {} },
      undefined,
      { timeout: 120_000 },
    );
    assert.match(textFromTool(statusResult), /ClankerOverflow mode: local/);
    assert.equal(statusResult.structuredContent?.mode, "local");
    assert.equal(statusResult.structuredContent?.semantic?.totalSolutions, 6);
    assert.equal(statusResult.structuredContent?.semantic?.embeddedSolutions, 6);
    assert.equal(statusResult.structuredContent?.semantic?.pendingEmbeddings, 0);
    assert.equal(statusResult.structuredContent?.semantic?.modelValid, true);
    assert.equal(statusResult.structuredContent?.semantic?.sqliteVecAvailable, true);
    assert.equal(statusResult.structuredContent?.semantic?.embedderAvailable, true);

    logStep("verifying MCP semantic search");
    const semanticResult = await client.callTool(
      {
        name: "search_solutions",
        arguments: {
          query: "browser dependencies unavailable in linux automation",
          mode: "semantic",
          limit: 1,
        },
      },
      undefined,
      { timeout: 120_000 },
    );
    assertTopProblem(
      textFromTool(semanticResult),
      fixtures.playwright.problem,
      "MCP semantic search",
    );

    logStep("verifying MCP auto fallback to hybrid");
    const autoResult = await client.callTool(
      {
        name: "search_solutions",
        arguments: {
          query: "address already occupied during frontend startup",
          limit: 1,
        },
      },
      undefined,
      { timeout: 120_000 },
    );
    const autoText = textFromTool(autoResult);
    assert.match(autoText, /Search attempts: keyword returned 0; hybrid returned 1\./);
    assertTopProblem(autoText, fixtures.vite.problem, "MCP auto search");
  } catch (error) {
    const stderr = stderrChunks.join("");
    if (stderr) console.error(stderr);
    throw error;
  } finally {
    await client.close();
  }
}

const tempRoot = await mkdtemp(join(tmpdir(), "clanker-local-e2e-"));

try {
  const home = join(tempRoot, "home");
  await mkdir(home, { recursive: true });
  const env = {
    ...process.env,
    HOME: home,
    NO_COLOR: "1",
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || join(tempRoot, "cache"),
    CLANKER_MODE: "local",
    CLANKER_LOCAL_DB: join(tempRoot, "solutions.sqlite"),
    CLANKER_SERVER_URL: "http://127.0.0.1:9",
    CLANKER_WEB_URL: "http://127.0.0.1:9",
    CLANKER_API_KEY: "",
  };

  await verifyDirectCli(env);
  await verifyMcp(env);
  logStep("passed");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
