import { describe, expect, test, vi } from "vitest";

import {
  chunkEmbeddingTokens,
  embedTextWithTokenChunks,
  maxEmbeddingChunkTokens,
  queryEmbeddingText,
  weightedAverageEmbeddingVectors,
} from "./local-semantic";

describe("local semantic embedding helpers", () => {
  test("splits tokenized text into context-safe chunks", () => {
    expect(maxEmbeddingChunkTokens(5)).toBe(3);
    expect(chunkEmbeddingTokens([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  test("weighted-averages and normalizes embedding vectors", () => {
    const averaged = weightedAverageEmbeddingVectors(
      [
        { vector: [1, 0], weight: 1 },
        { vector: [0, 1], weight: 3 },
      ],
      2,
    );

    expect(averaged[0]).toBeCloseTo(0.31622777);
    expect(averaged[1]).toBeCloseTo(0.94868329);
  });

  test("prefixes queries with the BGE v1.5 retrieval instruction", () => {
    // bge-small-en-v1.5 is an asymmetric retriever: the instruction goes on the
    // query side only, never the document side, to align query and passage
    // embeddings for retrieval.
    expect(queryEmbeddingText("gpu battery")).toBe(
      "Represent this sentence for searching relevant passages: gpu battery",
    );
    expect(queryEmbeddingText("  spaced  ")).toBe(
      "Represent this sentence for searching relevant passages: spaced",
    );
  });

  test("embeds over-context text as token chunks", async () => {
    const calls: Array<number[] | string> = [];
    const model = {
      trainContextSize: 5,
      tokenize: vi.fn((text: string) => Array.from(text).map((char) => char.charCodeAt(0))),
    };
    const context = {
      getEmbeddingFor: vi.fn(async (input: number[] | string) => {
        calls.push(input);
        if (Array.isArray(input) && input.length > 3) {
          throw new Error("Input is longer than the context size");
        }
        return { vector: [1, 0] };
      }),
    };

    const embedding = await embedTextWithTokenChunks(model, context, "abcdefghi", 2);

    expect(model.tokenize).toHaveBeenCalledWith("abcdefghi", false, "trimLeadingSpace");
    expect(calls).toEqual([
      [97, 98, 99],
      [100, 101, 102],
      [103, 104, 105],
    ]);
    expect(embedding.readFloatLE(0)).toBeCloseTo(1);
    expect(embedding.readFloatLE(4)).toBeCloseTo(0);
  });
});
