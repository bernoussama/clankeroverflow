import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { benchmarkCorpus } from "../../cli/benchmarks/local-embeddings/corpus";
import { summarizeMetrics } from "../../cli/benchmarks/local-embeddings/metrics";
import { evaluateRetrievalGate } from "../../cli/benchmarks/local-embeddings/quality-gate";
import * as schema from "../src/schema";
import { searchSolutions } from "../src/search";

const here = dirname(fileURLToPath(import.meta.url));
const infraDirectory = resolve(here, "../../infra");
const migrationsFolder = resolve(here, "../src/migrations");
const entrypoint = "retrieval-benchmark.run.ts";
const stage = `retrieval-${Date.now()}-${randomBytes(3).toString("hex")}`;
const token = randomBytes(32).toString("hex");
const output = resolve(
  process.argv[2] ??
    `packages/cli/benchmarks/local-embeddings/results/hosted-${new Date().toISOString().replaceAll(":", "-")}.json`,
);

function runAlchemy(command: "deploy" | "destroy") {
  return new Promise<string>((resolveRun, reject) => {
    const child = spawn("pnpm", ["exec", "alchemy", command, entrypoint, "--stage", stage], {
      cwd: infraDirectory,
      env: { ...process.env, RETRIEVAL_BENCHMARK_TOKEN: token },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveRun(stdout);
      else reject(new Error(`Alchemy ${command} failed (${code})\n${stderr}`));
    });
  });
}

async function post<T>(url: string, path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(new URL(path, url), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(`${path} failed (${response.status}): ${JSON.stringify(payload)}`);
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

const sleep = (milliseconds: number) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

function semanticFirst(semantic: string[], keyword: string[], limit = 10) {
  return [...new Set([...semantic, ...keyword])].slice(0, limit);
}

function rrf(semantic: string[], keyword: string[], limit = 10) {
  const scores = new Map<string, { score: number; bestRank: number }>();
  for (const [ranking, weight] of [
    [keyword, 1.25],
    [semantic, 1],
  ] as const) {
    ranking.forEach((id, index) => {
      const rank = index + 1;
      const current = scores.get(id) ?? { score: 0, bestRank: rank };
      current.score += weight / (60 + rank);
      current.bestRank = Math.min(current.bestRank, rank);
      scores.set(id, current);
    });
  }
  return [...scores]
    .sort(([, a], [, b]) => b.score - a.score || a.bestRank - b.bestRank)
    .slice(0, limit)
    .map(([id]) => id);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("DATABASE_URL is required for the disposable benchmark database");
  const baseUrl = new URL(connectionString);
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = "/postgres";
  const databaseName = `clankeroverflow_retrieval_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = new Pool({ connectionString: adminUrl.toString() });
  let pool: Pool | undefined;
  let deploymentAttempted = false;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = new Pool({ connectionString: databaseUrl.toString() });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    await db.insert(schema.solution).values(benchmarkCorpus.documents);

    deploymentAttempted = true;
    const deployOutput = await runAlchemy("deploy");
    const workerUrl = deployOutput.match(/RETRIEVAL_BENCHMARK_URL=(https?:\/\/\S+)/)?.[1];
    if (!workerUrl) throw new Error("Alchemy deploy did not report the benchmark Worker URL");
    const documents = benchmarkCorpus.documents.map((document) => ({
      id: document.id,
      text: `${document.tags.trim() ? `Tags: ${document.tags.trim()}\n\n` : ""}Problem:\n${document.problem.trim()}\n\nSolution:\n${document.solution.trim()}`,
    }));
    await post(workerUrl, "/seed", { documents });

    const sentinel = benchmarkCorpus.documents[0]!;
    const deadline = Date.now() + 120_000;
    while (true) {
      const ready = await post<{ rankings: Array<{ ids: string[] }> }>(workerUrl, "/query", {
        queries: [{ id: "readiness", text: sentinel.problem }],
        topK: 10,
      });
      if (ready.rankings[0]?.ids.includes(sentinel.id)) break;
      if (Date.now() >= deadline)
        throw new Error("Vectorize did not become queryable within 120 seconds");
      await sleep(2_000);
    }

    const semantic = new Map<string, string[]>();
    for (let start = 0; start < benchmarkCorpus.queries.length; start += 20) {
      const batch = benchmarkCorpus.queries.slice(start, start + 20);
      const response = await post<{ rankings: Array<{ queryId: string; ids: string[] }> }>(
        workerUrl,
        "/query",
        {
          queries: batch.map((query) => ({ id: query.id, text: query.text })),
          topK: 20,
        },
      );
      for (const row of response.rankings) semantic.set(row.queryId, row.ids);
    }
    const keyword = new Map<string, string[]>();
    for (const query of benchmarkCorpus.queries) {
      const rows = await searchSolutions(db, { query: query.text, limit: 20, strategy: "tiered" });
      keyword.set(
        query.id,
        rows.map((row) => row.id),
      );
    }
    const baseline = new Map(
      benchmarkCorpus.queries.map((query) => [
        query.id,
        semanticFirst(semantic.get(query.id) ?? [], keyword.get(query.id) ?? []),
      ]),
    );
    const candidate = new Map(
      benchmarkCorpus.queries.map((query) => [
        query.id,
        rrf(semantic.get(query.id) ?? [], keyword.get(query.id) ?? []),
      ]),
    );
    const gate = evaluateRetrievalGate(benchmarkCorpus.queries, baseline, candidate);
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      stage,
      corpus: {
        documents: benchmarkCorpus.documents.length,
        queries: benchmarkCorpus.queries.length,
      },
      baseline: summarizeMetrics(benchmarkCorpus.queries, baseline),
      candidate: summarizeMetrics(benchmarkCorpus.queries, candidate),
      gate,
    };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[benchmark] hosted report: ${output}`);
    if (!gate.passed) throw new Error(`RRF promotion gate failed: ${gate.failures.join("; ")}`);
  } finally {
    if (deploymentAttempted) {
      try {
        await runAlchemy("destroy");
      } catch (error) {
        console.error(error);
        console.error(
          `Manual cleanup required: cd packages/infra && RETRIEVAL_BENCHMARK_TOKEN=cleanup pnpm exec alchemy destroy ${entrypoint} --stage ${stage}`,
        );
      }
    }
    await pool?.end();
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
}

await main();
