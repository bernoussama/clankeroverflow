import { describe, expect, test } from "vitest";

import { searchKbDocuments } from "./search";

describe("searchKbDocuments", () => {
  test("returns no rows for a blank query without touching the database", async () => {
    const db = {
      select: () => {
        throw new Error("blank queries must not query");
      },
    };
    await expect(
      searchKbDocuments(db as never, { teamId: "team", query: "   ", limit: 5 }),
    ).resolves.toEqual([]);
  });
});
