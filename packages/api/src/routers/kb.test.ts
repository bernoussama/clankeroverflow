import { describe, expect, test } from "vitest";
import { MemoryObjectStore, TeamKnowledge } from "@clankeroverflow/kb";

import { t } from "../index";
import { appRouter } from "./index";

const createCaller = t.createCallerFactory(appRouter);

describe("kb router", () => {
  test("writes a draft and searches it for the team", async () => {
    const kb = new TeamKnowledge("team-1", new MemoryObjectStore());
    const caller = createCaller({
      auth: null as never,
      db: {} as never,
      session: { user: { id: "user-1" } } as never,
      apiKey: null,
      kb,
    });
    const written = await caller.kb.write({
      title: "pnpm workspace package fails with TS2307",
      problem: "TS2307: Cannot find module",
      solution: "Point exports at the source entry.",
      tags: ["pnpm"],
      force: true,
    });
    expect(written.status).toBe("written");
    const hits = await caller.kb.search({ query: "TS2307" });
    expect(hits[0]?.problem).toContain("TS2307");
    const lint = await caller.kb.lint();
    expect(Array.isArray(lint)).toBe(true);
  });

  test("rejects anonymous writes", async () => {
    const caller = createCaller({
      auth: null as never,
      db: {} as never,
      session: null,
      apiKey: null,
    });
    await expect(
      caller.kb.write({
        title: "Missing auth",
        problem: "No user",
        solution: "Sign in",
      }),
    ).rejects.toThrow(/API key/);
  });
});
