import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { SolutionFixture } from "./types.js";

export const RERANKER_MODEL_ID = "Xenova/ms-marco-MiniLM-L-6-v2";
export const RERANKER_REVISION = "e746e4abf0750f080e1e996a20dfcb32482661f2";
export const RERANKER_FIXTURE_VERSION = "fixture-v1";

export type RerankerScoreInput = {
  queryId?: string;
  solutionId?: string;
  queryText: string;
  solutionText: string;
};

export type Reranker = {
  provider: "cached-fixture" | "transformers.js";
  modelId: string;
  revision: string;
  cacheDir: string;
  score(input: RerankerScoreInput): Promise<number>;
};

type CachedFixture = {
  queryId: string;
  solutionId: string;
  score: number;
};

function tokens(text: string) {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

function deterministicFixtureScore(queryText: string, solutionText: string) {
  const queryTokens = tokens(queryText);
  const documentTokens = tokens(solutionText);
  if (queryTokens.size === 0 || documentTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (documentTokens.has(token)) overlap += 1;
  }
  const jaccard = overlap / new Set([...queryTokens, ...documentTokens]).size;
  const digest = createHash("sha256").update(`${queryText}\n${solutionText}`).digest();
  const tieBreaker = digest[0]! / 255_000;
  return Math.min(1, Math.max(0, jaccard + tieBreaker));
}

function defaultFixturePath() {
  return fileURLToPath(new URL("./reranker-fixtures.json", import.meta.url).toString());
}

export function loadCachedRerankerFixtures(path = defaultFixturePath()) {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CachedFixture[];
  const entries = new Map<string, number>();
  for (const fixture of parsed) {
    if (!Number.isFinite(fixture.score) || fixture.score < 0 || fixture.score > 1) {
      throw new Error(`Invalid cached reranker score for ${fixture.queryId}/${fixture.solutionId}`);
    }
    entries.set(`${fixture.queryId}:${fixture.solutionId}`, fixture.score);
  }
  return entries;
}

export function createFixtureReranker(options: {
  cacheDir: string;
  fixturePath?: string;
}): Reranker {
  const entries = loadCachedRerankerFixtures(options.fixturePath);
  return {
    provider: "cached-fixture",
    modelId: RERANKER_FIXTURE_VERSION,
    revision: RERANKER_FIXTURE_VERSION,
    cacheDir: options.cacheDir,
    async score(input) {
      const key = input.queryId && input.solutionId ? `${input.queryId}:${input.solutionId}` : "";
      return entries.get(key) ?? deterministicFixtureScore(input.queryText, input.solutionText);
    },
  };
}

type TextClassification = { label?: string; score?: number };
type Pipeline = (input: unknown) => Promise<unknown>;

function normalizedClassifierScore(output: unknown) {
  const values = Array.isArray(output) ? output : [output];
  const rows = values.flatMap((value) =>
    Array.isArray(value) ? value : [value],
  ) as TextClassification[];
  if (!rows.length) return 0;
  const relevant = rows.find((row) =>
    /relevant|positive|label[_ -]?1|entail/i.test(row.label ?? ""),
  );
  const selected = relevant ?? rows[0]!;
  return Math.min(1, Math.max(0, Number(selected.score ?? 0)));
}

export async function createTransformersReranker(options: {
  cacheDir: string;
  offline: boolean;
}): Promise<Reranker> {
  let pipeline: Pipeline;
  try {
    const module = (await import("@huggingface/transformers")) as unknown as {
      pipeline: (
        task: string,
        model: string,
        options: Record<string, unknown>,
      ) => Promise<Pipeline>;
      env?: { allowRemoteModels?: boolean; allowLocalModels?: boolean; cacheDir?: string };
    };
    if (module.env) {
      module.env.allowRemoteModels = !options.offline;
      module.env.allowLocalModels = true;
      module.env.cacheDir = options.cacheDir;
    }
    pipeline = await module.pipeline("text-classification", RERANKER_MODEL_ID, {
      revision: RERANKER_REVISION,
      cache_dir: options.cacheDir,
      local_files_only: options.offline,
    });
  } catch (error) {
    throw new Error(
      `Unable to load ${RERANKER_MODEL_ID} at revision ${RERANKER_REVISION}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return {
    provider: "transformers.js",
    modelId: RERANKER_MODEL_ID,
    revision: RERANKER_REVISION,
    cacheDir: options.cacheDir,
    async score(input) {
      const output = await pipeline({ text: input.queryText, text_pair: input.solutionText });
      return normalizedClassifierScore(output);
    },
  };
}

export async function createReranker(options: {
  mode: "fixture" | "transformers";
  cacheDir: string;
  offline: boolean;
  fixturePath?: string;
}): Promise<Reranker> {
  if (options.mode === "fixture") return createFixtureReranker(options);
  return createTransformersReranker(options);
}

export function rerankerInput(solution: SolutionFixture) {
  return [
    solution.title,
    solution.problem,
    `Root cause: ${solution.rootCause}`,
    `Solution: ${solution.solution}`,
    `Constraints: ${solution.constraints.runtime}; ${solution.constraints.dependencyVersions[Object.keys(solution.constraints.dependencyVersions)[0]!]}`,
  ].join("\n");
}
