import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { formatFixDocument, parseDocument } from "./document";
import { KnowledgeBase } from "./knowledge-base";
import { MarkdownStore } from "./store";
import type { FixDocument } from "./types";

const directories: string[] = [];

function tempKnowledgeBase() {
  const directory = mkdtempSync(join(tmpdir(), "clanker-kb-"));
  directories.push(directory);
  const repo = join(directory, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  return KnowledgeBase.open({
    cwd: repo,
    home: join(directory, "home"),
    teamRoot: join(directory, "team"),
  });
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("markdown knowledge base", () => {
  test("round-trips a fix document", () => {
    const document: FixDocument = {
      kind: "fix",
      id: "fix-1",
      path: "backend/ts2307.md",
      title: "pnpm workspace package fails with TS2307",
      type: "fix",
      area: "backend",
      tags: ["pnpm", "typescript"],
      aliases: ["Cannot find module"],
      errorSignatures: ["TS2307"],
      status: "draft",
      confirmations: 0,
      created: "2026-10-11",
      updated: "2026-10-11",
      problem: "TS2307: Cannot find module '@acme/ui'",
      rootCause: "The package exports map does not match the workspace source.",
      solution: "Point exports at the source entry during development.",
      verification: "tsc --noEmit passed.",
      notes: "",
    };
    const parsed = parseDocument(document.path, formatFixDocument(document));
    expect(parsed).toMatchObject({
      kind: "fix",
      id: "fix-1",
      title: document.title,
      tags: ["pnpm", "typescript"],
      errorSignatures: ["TS2307"],
      solution: document.solution,
    });
  });

  test("appends note lines without dropping earlier lines", () => {
    const kb = tempKnowledgeBase();
    kb.append("repo", "team/structure.md", {
      text: "Alex leads billing",
      metadata: { source: "claude-code/session-1", added: "2026-10-11" },
    });
    kb.append("repo", "team/structure.md", {
      text: "Billing shares a launch deadline with the website",
      metadata: { source: "codex/session-2", added: "2026-10-11" },
    });
    const loaded = kb.read("team/structure.md", "repo");
    expect(loaded?.document.kind).toBe("note");
    if (loaded?.document.kind === "note") {
      expect(loaded.document.entries.map((entry) => entry.text)).toEqual([
        "Alex leads billing",
        "Billing shares a launch deadline with the website",
      ]);
      expect(loaded.document.entries[0]?.metadata.source).toBe("claude-code/session-1");
    }
  });

  test("ranks a repo hit ahead of an equally scored team hit", () => {
    const kb = tempKnowledgeBase();
    const input = {
      title: "Vite exits with EADDRINUSE on port 5173",
      problem: "Vite exits with EADDRINUSE on port 5173",
      solution: "Stop the process holding port 5173.",
      tags: ["vite"],
      errorSignatures: ["EADDRINUSE"],
      path: "vite/eaddrinuse.md",
    };
    kb.writeFix("team", { ...input, id: "team-doc" }, { dedupe: false });
    kb.writeFix("repo", { ...input, id: "repo-doc" }, { dedupe: false });
    const hits = kb.search("EADDRINUSE 5173", { limit: 2 });
    expect(hits[0]?.id).toBe("repo-doc");
    expect(hits[0]?.layer).toBe("repo");
    expect(hits[1]?.layer).toBe("team");
  });

  test("promotes a draft to verified on the first confirmation", () => {
    const kb = tempKnowledgeBase();
    const written = kb.writeFix(
      "repo",
      {
        title: "Cache stays stale",
        problem: "Next.js cache tags are not invalidating",
        solution: "Call revalidateTag with the page tag.",
        tags: ["nextjs"],
      },
      { dedupe: false },
    );
    expect(written.status).toBe("written");
    if (written.status !== "written") return;
    const confirmed = kb.confirm("repo", written.document.path, true);
    expect(confirmed.status).toBe("verified");
    expect(confirmed.confirmations).toBe(1);
  });

  test("refuses a duplicate title unless dedupe is off", () => {
    const kb = tempKnowledgeBase();
    const input = {
      title: "Same bug",
      problem: "Same bug",
      solution: "First fix",
      tags: ["api"],
    };
    kb.writeFix("repo", input, { dedupe: false });
    const duplicate = kb.writeFix("repo", { ...input, solution: "Second fix" });
    expect(duplicate.status).toBe("possible_duplicate");
  });

  test("scrubs local paths before writing", () => {
    const directory = mkdtempSync(join(tmpdir(), "clanker-kb-store-"));
    directories.push(directory);
    const store = new MarkdownStore(directory, "personal");
    const written = store.writeFix({
      title: "Logs leaked a path",
      problem: "Failed while reading /home/alice/project/secret.env",
      solution: "Stop logging absolute paths.",
    });
    expect(written.status).toBe("written");
    if (written.status !== "written") return;
    const file = readFileSync(join(directory, written.document.path), "utf8");
    expect(file).toContain("<local-path>");
    expect(file).not.toContain("/home/alice");
  });
});
