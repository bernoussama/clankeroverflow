import { describe, expect, test } from "vitest";

import { formatFixDocument } from "./document";
import { MemoryObjectStore, TeamKnowledge } from "./engine";
import { isBotCommit, planInbound } from "./github";
import { lintDocuments } from "./lint";
import { memoryLink, swarmPaths } from "./swarm";
import { AGENTS_MD } from "./template";
import type { FixDocument } from "./types";

function fix(overrides: Partial<FixDocument> = {}): FixDocument {
  return {
    kind: "fix",
    id: "fix-1",
    path: "backend/ts2307.md",
    title: "pnpm workspace package fails with TS2307",
    type: "fix",
    area: "backend",
    tags: ["pnpm"],
    aliases: [],
    errorSignatures: ["TS2307"],
    status: "draft",
    confirmations: 0,
    created: "2026-10-11",
    updated: "2026-10-11",
    problem: "TS2307: Cannot find module",
    rootCause: "Exports map is wrong.",
    solution: "Point exports at the source.",
    verification: "tsc passed.",
    notes: "",
    authors: ["ada"],
    ...overrides,
  };
}

describe("team knowledge base", () => {
  test("locks the agent template and refuses a duplicate title", async () => {
    const team = new TeamKnowledge("team-1", new MemoryObjectStore());
    await team.seedTemplate();
    expect(team.read("AGENTS.md")?.markdown).toContain("swarms/{name}/README.md");
    expect(AGENTS_MD).toContain("An author cannot verify their own doc");
    const first = await team.write({
      markdown: formatFixDocument(fix()),
      path: "backend/ts2307.md",
      baseRev: null,
      source: "api",
      author: "ada",
    });
    expect(first.status).toBe("written");
    const duplicate = await team.write({
      markdown: formatFixDocument(fix({ id: "fix-2", path: "backend/other.md" })),
      path: "backend/other.md",
      baseRev: null,
      source: "api",
      author: "ada",
    });
    expect(duplicate.status).toBe("possible_duplicate");
  });

  test("returns a conflict when the base revision is stale", async () => {
    const team = new TeamKnowledge("team-1", new MemoryObjectStore());
    const written = await team.write({
      markdown: formatFixDocument(fix()),
      path: "backend/ts2307.md",
      baseRev: null,
      source: "cli",
      force: true,
    });
    if (written.status !== "written") throw new Error(written.status);
    const conflict = await team.write({
      markdown: formatFixDocument(fix({ solution: "A different fix." })),
      path: "backend/ts2307.md",
      baseRev: written.rev - 1,
      source: "cli",
      force: true,
    });
    expect(conflict.status).toBe("conflict");
  });

  test("an author cannot verify their own draft", async () => {
    const team = new TeamKnowledge("team-1", new MemoryObjectStore());
    await team.write({
      markdown: formatFixDocument(fix()),
      path: "backend/ts2307.md",
      baseRev: null,
      source: "api",
      author: "ada",
      force: true,
    });
    await team.confirm("backend/ts2307.md", true, "ada");
    const own = team.read("backend/ts2307.md");
    expect(own?.markdown).toContain("status: draft");
    await team.confirm("backend/ts2307.md", true, "grace");
    expect(team.read("backend/ts2307.md")?.markdown).toContain("status: verified");
  });

  test("hides human-review drafts until someone else confirms them", async () => {
    const team = new TeamKnowledge("team-1", new MemoryObjectStore(), "human");
    await team.write({
      markdown: formatFixDocument(fix()),
      path: "backend/ts2307.md",
      baseRev: null,
      source: "api",
      author: "ada",
      force: true,
    });
    expect(team.search("TS2307")).toEqual([]);
    await team.confirm("backend/ts2307.md", true, "grace");
    expect(team.search("TS2307")[0]?.path).toBe("backend/ts2307.md");
  });

  test("dreams only after new changes and keeps the output a draft", async () => {
    const team = new TeamKnowledge("team-1", new MemoryObjectStore());
    expect((await team.runDream(500)).skipped).toBe(true);
    await team.write({
      markdown: formatFixDocument(fix()),
      path: "backend/ts2307.md",
      baseRev: null,
      source: "api",
      force: true,
    });
    const dreamed = await team.runDream(4000);
    expect(dreamed.skipped).toBe(false);
    expect(dreamed.tokens).toBeGreaterThan(0);
    expect(dreamed.tokens).toBeLessThanOrEqual(4000);
    expect(team.read("dreams/ts2307.md")?.markdown).toContain("status: draft");
    expect((await team.runDream(4000)).skipped).toBe(true);
    expect(team.dreamTokens).toBe(dreamed.tokens);
  });

  test("keeps the API version on a GitHub conflict and ignores bot commits", async () => {
    const team = new TeamKnowledge("team-1", new MemoryObjectStore());
    const written = await team.write({
      markdown: formatFixDocument(fix()),
      path: "backend/ts2307.md",
      baseRev: null,
      source: "api",
      force: true,
    });
    if (written.status !== "written") throw new Error(written.status);
    const plans = planInbound(
      [
        {
          path: "backend/ts2307.md",
          markdown: formatFixDocument(fix({ solution: "GitHub copy." })),
          commitMessage: "edit from github",
          previousSyncedRev: 0,
        },
        {
          path: "backend/other.md",
          markdown: "note",
          commitMessage: "bot\n\nClanker-Change: 4\n",
          previousSyncedRev: null,
        },
      ],
      [{ path: "backend/ts2307.md", rev: written.rev, markdown: formatFixDocument(fix()) }],
    );
    expect(plans[0]?.kind).toBe("conflict");
    expect(plans[1]?.kind).toBe("ignore");
    expect(isBotCommit("update backend/ts2307.md\n\nClanker-Change: 2\n")).toBe(true);
    await team.applyGithubInbound([
      {
        path: "backend/ts2307.md",
        markdown: formatFixDocument(fix({ solution: "GitHub copy." })),
        commitMessage: "edit from github",
        previousSyncedRev: 0,
      },
    ]);
    expect(team.read("backend/ts2307.md")?.markdown).toContain("Point exports at the source.");
    expect(team.read("conflicts/backend/ts2307.md")?.markdown).toContain("GitHub copy.");
    expect(team.outboundGithub(0)[0]?.message).toContain("Clanker-Change:");
  });

  test("repairs a missing materialized object and reports near-duplicate areas", async () => {
    const objects = new MemoryObjectStore();
    const team = new TeamKnowledge("team-1", objects, "auto", () => Date.now() - 86_400_000 * 2);
    await team.write({
      markdown: formatFixDocument(fix()),
      path: "backend/ts2307.md",
      baseRev: null,
      source: "api",
      force: true,
    });
    await team.write({
      markdown: formatFixDocument(
        fix({ id: "fix-2", path: "back-end/other.md", area: "back-end", title: "Other" }),
      ),
      path: "back-end/other.md",
      baseRev: null,
      source: "api",
      force: true,
    });
    await objects.delete("kb/team-1/docs/backend/ts2307.md");
    const report = await team.reconcile(0);
    expect(report.repaired).toContain("backend/ts2307.md");
    expect(await objects.get("kb/team-1/docs/backend/ts2307.md")).not.toBeNull();
    const issues = lintDocuments(team.listDocuments());
    expect(issues.some((issue) => issue.code === "near-duplicate-area")).toBe(true);
  });

  test("collects a swarm back into the memory entry point", () => {
    const paths = swarmPaths("Billing launch");
    expect(paths.readme).toBe("swarms/billing-launch/README.md");
    expect(memoryLink("Billing launch")).toContain("[[swarms/billing-launch/README]]");
  });
});
