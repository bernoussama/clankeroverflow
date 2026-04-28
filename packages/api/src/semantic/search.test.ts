import { describe, expect, mock, test } from "bun:test";
import { searchSolutionsHybrid, searchSolutionsSemantic } from "./search";

function createRow(id: string) {
  return {
    id,
    problem: `problem-${id}`,
    solution: `solution-${id}`,
    tags: null,
    userId: null,
    score: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createDb(params: {
  semanticRows?: ReturnType<typeof createRow>[];
  keywordRows?: ReturnType<typeof createRow>[];
}) {
  const semanticRows = params.semanticRows ?? [];
  const keywordRows = params.keywordRows ?? [];

  const selectChain = {
    from: mock(() => selectChain),
    where: mock(() => Promise.resolve(semanticRows)),
  };

  return {
    select: mock(() => selectChain),
    execute: mock(async () => ({ rows: keywordRows })),
  };
}

describe("searchSolutionsSemantic", () => {
  test("returns rows in vector match order", async () => {
    const db = createDb({
      semanticRows: [createRow("b"), createRow("a")],
    });

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

  test("returns early for blank queries without calling AI or Vectorize", async () => {
    const db = createDb({});
    const ai = {
      run: mock(async () => ({ data: [[0.1]] })),
    };
    const vectorize = {
      query: mock(async () => ({ matches: [{ id: "a", score: 0.9 }] })),
      upsert: mock(async () => {}),
    };

    const out = await searchSolutionsSemantic({
      db: db as any,
      ai,
      vectorize,
      query: "   ",
      limit: 10,
    });

    expect(out).toEqual([]);
    expect(ai.run).not.toHaveBeenCalled();
    expect(vectorize.query).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("searchSolutionsHybrid", () => {
  test("merges semantic-first results with keyword-only rows and removes duplicates", async () => {
    const db = createDb({
      semanticRows: [createRow("a"), createRow("b")],
      keywordRows: [createRow("c"), createRow("a"), createRow("d")],
    });
    const ai = {
      run: mock(async () => ({ data: [[0.1]] })),
    };
    const vectorize = {
      query: mock(async () => ({
        matches: [
          { id: "b", score: 0.95 },
          { id: "a", score: 0.8 },
        ],
      })),
      upsert: mock(async () => {}),
    };

    const out = await searchSolutionsHybrid({
      db: db as any,
      ai,
      vectorize,
      query: "cache invalidation",
      limit: 3,
    });

    expect(out.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
