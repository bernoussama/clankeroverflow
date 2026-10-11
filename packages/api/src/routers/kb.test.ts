import { describe, expect, test } from "vitest";
import { MemoryObjectStore, TeamKnowledge } from "@clankeroverflow/kb";

import { MemoryTeamRepository, dreamPersistedTeams } from "../kb/repository";

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

  test("reloads a team document after the process cache is gone", async () => {
    const teamRepository = new MemoryTeamRepository();
    const writer = createCaller({
      auth: null as never,
      db: {} as never,
      session: { user: { id: "user-1" } } as never,
      apiKey: null,
      teamRepository,
    });
    const written = await writer.kb.write({
      title: "Cache tags stay stale",
      problem: "Next.js cache tags are not invalidating",
      solution: "Call revalidateTag with the page tag.",
      tags: ["nextjs"],
      force: true,
    });
    expect(written.status).toBe("written");

    const reader = createCaller({
      auth: null as never,
      db: {} as never,
      session: { user: { id: "user-1" } } as never,
      apiKey: null,
      teamRepository,
    });
    const hits = await reader.kb.search({ query: "revalidateTag" });
    expect(hits[0]?.problem).toContain("Cache tags");
    const doc = await reader.kb.read({ path: hits[0]!.path });
    expect(doc.rev).toBeGreaterThan(0);
    expect(doc.markdown).toContain("revalidateTag");
  });

  test("dreams once and then skips until another change arrives", async () => {
    const teamRepository = new MemoryTeamRepository();
    const caller = createCaller({
      auth: null as never,
      db: {} as never,
      session: { user: { id: "user-1" } } as never,
      apiKey: null,
      teamRepository,
    });
    await caller.kb.write({
      title: "Ports in use",
      problem: "Vite exits with EADDRINUSE",
      solution: "Start Vite on a free port.",
      tags: ["vite"],
      force: true,
    });
    const first = await dreamPersistedTeams({ repository: teamRepository, tokenBudget: 4000 });
    const second = await dreamPersistedTeams({ repository: teamRepository, tokenBudget: 4000 });
    expect(first[0]?.skipped).toBe(false);
    expect(first[0]?.tokens).toBeGreaterThan(0);
    expect(second[0]?.skipped).toBe(true);
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
