import { createHash } from "node:crypto";

import alchemy from "alchemy";
import { Ai, VectorizeIndex, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const stateToken =
  process.env.ALCHEMY_STATE_TOKEN?.trim() ||
  process.env.ALCHEMY_PASSWORD?.trim() ||
  process.env.CLOUDFLARE_API_TOKEN?.trim();
const benchmarkToken = process.env.RETRIEVAL_BENCHMARK_TOKEN?.trim();
if (!stateToken) throw new Error("ALCHEMY_STATE_TOKEN or CLOUDFLARE_API_TOKEN is required");
if (!benchmarkToken) throw new Error("RETRIEVAL_BENCHMARK_TOKEN is required");

const app = await alchemy("clankeroverflow-retrieval-benchmark", {
  stateStore: (scope) =>
    new CloudflareStateStore(scope, {
      stateToken: alchemy.secret(createHash("sha256").update(stateToken).digest("hex")),
    }),
});

const index = await VectorizeIndex("benchmark-vectors", {
  dimensions: 768,
  metric: "cosine",
});

export const worker = await Worker("benchmark-worker", {
  cwd: ".",
  entrypoint: "src/retrieval-benchmark-worker.ts",
  bindings: {
    AI: Ai(),
    SOLUTION_VECTORS: index,
    BENCHMARK_TOKEN: alchemy.secret(benchmarkToken),
  },
});

console.log(`RETRIEVAL_BENCHMARK_URL=${worker.url}`);
await app.finalize();
