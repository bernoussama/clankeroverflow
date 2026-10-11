import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { findRepoRoot, parseLearnMarkdown, DEFAULT_REPO_SOLUTIONS_DIR } from "../learn";
import type { KnowledgeBase } from "./knowledge-base";

export function migrateLocalKnowledge(
  knowledgeBase: KnowledgeBase,
  options: { repoRoot?: string | null; layer?: "personal" | "repo" } = {},
) {
  let imported = 0;
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
          options.layer ?? "repo",
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
