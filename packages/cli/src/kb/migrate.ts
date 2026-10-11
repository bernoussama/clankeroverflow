import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { findRepoRoot, parseLearnMarkdown, DEFAULT_REPO_SOLUTIONS_DIR } from "../learn";
import { openLocalDb } from "../mcp/local-db";
import type { KnowledgeBase } from "./knowledge-base";

type SqliteSolution = {
  id: string;
  problem: string;
  solution: string;
  tags: string | null;
};

export function migrateLocalKnowledge(
  knowledgeBase: KnowledgeBase,
  options: { sqlitePath?: string; repoRoot?: string | null; layer?: "personal" | "repo" } = {},
) {
  const layer = options.layer ?? "personal";
  let imported = 0;
  const sqlitePath = options.sqlitePath;
  if (sqlitePath && existsSync(sqlitePath)) {
    const db = openLocalDb(sqlitePath);
    try {
      const rows = db
        .prepare("SELECT id, problem, solution, tags FROM solution")
        .all() as SqliteSolution[];
      for (const row of rows) {
        knowledgeBase.writeFix(
          layer,
          {
            id: row.id,
            title: row.problem,
            problem: row.problem,
            solution: row.solution,
            tags: (row.tags ?? "")
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          },
          { dedupe: false },
        );
        imported += 1;
      }
    } finally {
      db.close();
    }
  }

  const repoRoot = options.repoRoot === undefined ? findRepoRoot() : options.repoRoot;
  if (repoRoot) {
    const directory = join(repoRoot, DEFAULT_REPO_SOLUTIONS_DIR);
    if (existsSync(directory)) {
      for (const name of readdirSync(directory)) {
        if (!name.endsWith(".md")) continue;
        const markdown = readFileSync(join(directory, name), "utf8");
        const learned = parseLearnMarkdown(markdown);
        if (!learned.problem || !learned.solution) continue;
        const id = name.replace(/\.md$/, "");
        knowledgeBase.writeFix(
          "repo",
          {
            id,
            title: learned.problem,
            problem: learned.problem,
            solution: learned.solution,
            rootCause: learned.rootCause,
            verification: learned.verification,
            tags: learned.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          },
          { dedupe: false },
        );
        imported += 1;
      }
    }
  }

  knowledgeBase.init();
  return { imported };
}
