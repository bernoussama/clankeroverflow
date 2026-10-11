import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { benchmarkCorpus } from "./corpus.js";
import { queryMetrics } from "./metrics.js";
import type { BenchmarkQuery } from "./types.js";
import { KnowledgeBase } from "../../src/kb/knowledge-base.js";

export type RetrievalEvalReport = {
  queries: number;
  markdown: { recall5: number; recall10: number; ndcg10: number };
  passed: boolean;
};

function recallAt(query: BenchmarkQuery, ranking: readonly string[], limit: number) {
  const useful = Object.entries(query.relevance)
    .filter(([, grade]) => grade >= 2)
    .map(([id]) => id);
  if (!useful.length) return 0;
  const found = ranking.slice(0, limit).filter((id) => useful.includes(id)).length;
  return found / useful.length;
}

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
}

function summarize(queries: BenchmarkQuery[], rankings: Map<string, string[]>) {
  const rows = queries.map((query) => {
    const ranking = rankings.get(query.id) ?? [];
    return {
      recall5: recallAt(query, ranking, 5),
      recall10: queryMetrics(query, ranking).recall10,
      ndcg10: queryMetrics(query, ranking).ndcg10,
    };
  });
  return {
    recall5: mean(rows.map((row) => row.recall5)),
    recall10: mean(rows.map((row) => row.recall10)),
    ndcg10: mean(rows.map((row) => row.ndcg10)),
  };
}

function markdownRankings() {
  const directory = mkdtempSync(join(tmpdir(), "clanker-markdown-retrieval-"));
  try {
    const repo = join(directory, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    const knowledgeBase = KnowledgeBase.open({
      cwd: repo,
      home: join(directory, "home"),
      teamRoot: join(directory, "team"),
    });
    for (const document of benchmarkCorpus.documents) {
      knowledgeBase.writeFix(
        "team",
        {
          id: document.id,
          title: document.problem,
          problem: document.problem,
          solution: document.solution,
          tags: document.tags.split(",").map((tag) => tag.trim()),
          aliases: [document.problem],
          area: document.tags.split(",")[0]?.trim() || "general",
          path: `${document.tags.split(",")[0]?.trim() || "general"}/${document.id}.md`,
        },
        { dedupe: false },
      );
    }
    return new Map(
      benchmarkCorpus.queries.map(
        (query) =>
          [query.id, knowledgeBase.search(query.text, { limit: 10 }).map((hit) => hit.id)] as const,
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function runMarkdownRetrievalEval(): RetrievalEvalReport {
  const queries = [...benchmarkCorpus.queries];
  const markdown = summarize(queries, markdownRankings());
  return {
    queries: queries.length,
    markdown,
    passed: markdown.recall5 >= 0.9,
  };
}

export function recall5(rankings: ReadonlyMap<string, readonly string[]>) {
  return mean(
    benchmarkCorpus.queries.map((query) => recallAt(query, rankings.get(query.id) ?? [], 5)),
  );
}

const isDirectRun = process.argv[1]?.includes("markdown-retrieval/run");
if (isDirectRun) {
  const report = runMarkdownRetrievalEval();
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
