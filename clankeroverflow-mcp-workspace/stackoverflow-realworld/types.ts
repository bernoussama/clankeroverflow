export type Split = "development" | "test";

export type ContentAttribution = {
  postUrl: string;
  contentLicense: string | null;
  authorUserId: string | null;
  authorDisplayName: string | null;
};

export type StackOverflowSolution = {
  id: string;
  canonicalQuestionId: string;
  acceptedAnswerId: string;
  title: string;
  questionText: string;
  answerText: string;
  questionBodyHtml: string;
  answerBodyHtml: string;
  questionAttribution: ContentAttribution;
  answerAttribution: ContentAttribution;
  tags: string[];
  questionScore: number;
  answerScore: number;
  creationDate: string;
};

export type StackOverflowQuery = {
  id: string;
  duplicateQuestionId: string;
  title: string;
  text: string;
  bodyHtml: string;
  attribution: ContentAttribution;
  tags: string[];
  primaryTag: string;
  dateBucket: string;
  creationDate: string;
  relevantSolutionIds: string[];
  split: Split;
};

export type DatasetManifest = {
  version: 2;
  source: {
    filename: string;
    sha256: string;
    bytes: number;
    extractedVia: "Stack Exchange Data Explorer";
    sampling: string;
  };
  generatedAt: string;
  counts: {
    relationships: number;
    solutions: number;
    queries: number;
    multiGoldQueries: number;
    developmentQueries: number;
    testQueries: number;
  };
  split: {
    method: string;
    seed: string;
  };
  licenses: {
    columnsPresent: string[];
    columnsMissing: string[];
    relationshipsWithCompleteProvenance: number;
    relationshipsMissingProvenance: number;
    redistributionReady: boolean;
  };
};

export type MetricName =
  | "hit1"
  | "hit5"
  | "hit10"
  | "recall1"
  | "recall5"
  | "recall10"
  | "mrr10"
  | "ndcg10";
export type MetricInterval = { value: number; low: number; high: number };
export type MetricSummary = Record<MetricName, MetricInterval>;

export type MethodName = "exact" | "tiered";
