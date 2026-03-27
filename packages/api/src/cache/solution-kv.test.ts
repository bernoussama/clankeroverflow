import { describe, expect, test } from "bun:test";
import {
  bumpSolutionListCacheVersion,
  getSolutionListCacheVersion,
  solutionDetailCacheKey,
  solutionListCacheKey,
  solutionSearchCacheKey,
} from "./solution-kv";

function createMemoryKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

describe("solution-kv", () => {
  test("list version bumps monotonically", async () => {
    const kv = createMemoryKv();
    expect(await getSolutionListCacheVersion(kv)).toBe(0);
    await bumpSolutionListCacheVersion(kv);
    expect(await getSolutionListCacheVersion(kv)).toBe(1);
    await bumpSolutionListCacheVersion(kv);
    expect(await getSolutionListCacheVersion(kv)).toBe(2);
  });

  test("search key normalizes query spacing and case", () => {
    const a = solutionSearchCacheKey(1, "  Foo   Bar  ", 10);
    const b = solutionSearchCacheKey(1, "foo bar", 10);
    expect(a).toBe(b);
  });

  test("list key encodes cursor and sort", () => {
    const k = solutionListCacheKey(
      3,
      "top",
      { id: "x", createdAt: "2020-01-01T00:00:00.000Z", score: 7 },
      20,
    );
    expect(k).toContain("sol:list:3:top:");
    expect(k).toContain(":20");
  });

  test("detail key is stable per id", () => {
    expect(solutionDetailCacheKey("abc")).toBe("sol:detail:abc");
  });
});
