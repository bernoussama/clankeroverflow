import { describe, expect, mock, test } from "bun:test";
import { SOLUTION_EMBEDDING_MODEL } from "./constants";
import { embedTexts } from "./embeddings";

describe("embedTexts", () => {
  test("calls Workers AI with cls pooling", async () => {
    const run = mock(async () => ({
      data: [[0.1, 0.2]],
      shape: [1, 2],
    }));
    const out = await embedTexts({ run }, ["hello"]);
    expect(out).toEqual([[0.1, 0.2]]);
    expect(run).toHaveBeenCalledWith(SOLUTION_EMBEDDING_MODEL, {
      text: ["hello"],
      pooling: "cls",
    });
  });
});
