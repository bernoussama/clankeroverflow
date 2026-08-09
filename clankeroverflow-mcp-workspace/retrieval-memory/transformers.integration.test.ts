import { describe, expect, test } from "vitest";

import { createTransformersReranker, RERANKER_MODEL_ID, RERANKER_REVISION } from "./reranker.js";

const enabled = process.env.MEMORY_RERANKER_INTEGRATION === "1";

describe.skipIf(!enabled)("Transformers.js reranker integration", () => {
  test("loads the pinned model and scores a text pair", async () => {
    const reranker = await createTransformersReranker({
      cacheDir: process.env.MEMORY_RERANKER_CACHE ?? ".cache/clankeroverflow-memory-retrieval",
      offline: process.env.MEMORY_RERANKER_OFFLINE === "1",
    });
    const score = await reranker.score({
      queryId: "integration-query",
      solutionId: "integration-solution",
      queryText: "Vite server is unreachable from a container",
      solutionText: "Bind the Vite server to 0.0.0.0 and verify the published port.",
    });
    expect(reranker.modelId).toBe(RERANKER_MODEL_ID);
    expect(reranker.revision).toBe(RERANKER_REVISION);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
