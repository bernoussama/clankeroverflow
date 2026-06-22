const MODEL = "@cf/baai/bge-base-en-v1.5";
const BATCH_SIZE = 50;

type Env = {
  AI: { run(model: string, input: { text: string[] }): Promise<unknown> };
  SOLUTION_VECTORS: {
    upsert(vectors: Array<{ id: string; values: number[] }>): Promise<unknown>;
    query(
      vector: number[],
      options: { topK: number },
    ): Promise<{ matches?: Array<{ id: string }> }>;
  };
  BENCHMARK_TOKEN: string;
};

type Document = { id: string; text: string };

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function embeddingRows(result: unknown): number[][] {
  if (!result || typeof result !== "object") throw new Error("Workers AI returned no embeddings");
  const record = result as { data?: number[][]; shape?: number[] };
  if (!Array.isArray(record.data)) throw new Error("Workers AI returned an unexpected payload");
  return record.data;
}

async function embed(env: Env, texts: string[]) {
  return embeddingRows(await env.AI.run(MODEL, { text: texts }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("authorization") !== `Bearer ${env.BENCHMARK_TOKEN}`) {
      return json({ error: "unauthorized" }, 401);
    }
    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/seed") {
        const { documents } = (await request.json()) as { documents?: Document[] };
        if (!Array.isArray(documents) || documents.length === 0) {
          return json({ error: "documents are required" }, 400);
        }
        if (documents.some((document) => !document?.id || !document?.text)) {
          return json({ error: "each document must include id and text" }, 400);
        }
        for (let start = 0; start < documents.length; start += BATCH_SIZE) {
          const batch = documents.slice(start, start + BATCH_SIZE);
          const vectors = await embed(
            env,
            batch.map((document) => document.text),
          );
          if (vectors.length !== batch.length || vectors.some((vector) => vector.length !== 768)) {
            throw new Error("Unexpected embedding dimensions");
          }
          await env.SOLUTION_VECTORS.upsert(
            batch.map((document, index) => ({ id: document.id, values: vectors[index]! })),
          );
        }
        return json({ seeded: documents.length });
      }
      if (request.method === "POST" && url.pathname === "/query") {
        const { queries, topK = 20 } = (await request.json()) as {
          queries?: Array<{ id: string; text: string }>;
          topK?: number;
        };
        if (!Array.isArray(queries) || queries.length === 0) {
          return json({ error: "queries are required" }, 400);
        }
        if (queries.some((query) => !query?.id || !query?.text)) {
          return json({ error: "each query must include id and text" }, 400);
        }
        const rankings: Array<{ queryId: string; ids: string[] }> = [];
        for (let start = 0; start < queries.length; start += BATCH_SIZE) {
          const batch = queries.slice(start, start + BATCH_SIZE);
          const vectors = await embed(
            env,
            batch.map((query) => query.text),
          );
          if (vectors.length !== batch.length || vectors.some((vector) => vector.length !== 768)) {
            throw new Error("Unexpected embedding dimensions");
          }
          for (let index = 0; index < batch.length; index += 1) {
            const result = await env.SOLUTION_VECTORS.query(vectors[index]!, {
              topK: Math.min(50, Math.max(1, topK)),
            });
            rankings.push({
              queryId: batch[index]!.id,
              ids: (result.matches ?? []).map((match) => match.id),
            });
          }
        }
        return json({ rankings });
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  },
};
