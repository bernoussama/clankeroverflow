export type BenchmarkCategory =
  | "literal"
  | "paraphrase"
  | "solution-intent"
  | "hard-negative"
  | "cross-language";

export type BenchmarkLanguage = "en" | "fr" | "ar";

export type BenchmarkDocument = {
  id: string;
  problem: string;
  solution: string;
  tags: string;
};

export type BenchmarkQuery = {
  id: string;
  text: string;
  language: BenchmarkLanguage;
  category: BenchmarkCategory;
  expectedRetrieval: "exact" | "relaxed" | "semantic";
  lexicalAnchor?: boolean;
  relevance: Record<string, 1 | 2 | 3>;
};

export type BenchmarkCorpus = {
  version: 1;
  documents: BenchmarkDocument[];
  queries: BenchmarkQuery[];
};

export type ModelKey = "qwen" | "nomic" | "bge" | "granite";
export type BackendKey = "cpu" | "auto";
export type ProfileKey = "native" | "raw";

export type Ranking = {
  queryId: string;
  semantic: string[];
  hybrid: string[];
};

export type FullWorkerResult = {
  model: ModelKey;
  profile: ProfileKey;
  backend: BackendKey;
  resolvedBackend: string;
  dimensions: number;
  contextSize: number;
  gpuLayers: number;
  loadMs: number;
  indexRuns: Array<{ elapsedMs: number; tokens: number; documents: number }>;
  queryLatenciesMs: number[];
  rankings?: Ranking[];
  peakRssBytes: number;
};

export type ColdWorkerResult = {
  model: ModelKey;
  backend: BackendKey;
  resolvedBackend: string;
  loadMs: number;
  firstQueryMs: number;
  peakRssBytes: number;
};
