import { describe, expect, mock, test } from "bun:test";
import { searchSolutionsSemantic } from "./search";

describe("searchSolutionsSemantic", () => {
  test("returns rows in vector match order", async () => {
    const rows = [
      { id: "b", problem: "pb", solution: "sb", tags: null, userId: null, score: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: "a", problem: "pa", solution: "sa", tags: null, userId: null, score: 0, createdAt: new Date(), updatedAt: new Date() },
    ];

    const db = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => Promise.resolve(rows)),
        })),
      })),
    };

    const ai = {
      run: mock(async () => ({ data: [[0.1]] })),
    };

    const vectorize = {
      query: mock(async () => ({
        matches: [{ id: "a", score: 0.9 }, { id: "b", score: 0.5 }],
      })),
      upsert: mock(async () => {}),
    };

    const out = await searchSolutionsSemantic({
      db: db as any,
      ai,
      vectorize,
      query: "fix",
      limit: 10,
    });

    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
