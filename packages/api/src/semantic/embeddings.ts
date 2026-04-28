import { SOLUTION_EMBEDDING_MODEL } from "./constants";

/** Subset of Workers AI binding used for embeddings. */
export type WorkersAiBinding = {
  run(
    model: string,
    args: { text: string | string[]; pooling?: string },
  ): Promise<{ shape?: number[]; data: number[][]; pooling?: string }>;
};

export async function embedTexts(ai: WorkersAiBinding, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const modelResp = (await ai.run(SOLUTION_EMBEDDING_MODEL, {
    text: texts,
    pooling: "cls",
  })) as Awaited<ReturnType<WorkersAiBinding["run"]>>;

  if (!modelResp?.data?.length) {
    throw new Error("Workers AI returned no embedding vectors");
  }

  return modelResp.data;
}
