export type SearchMode = "keyword" | "semantic" | "hybrid";

export type LogSolutionInput = {
  problem: string;
  solution: string;
  tags?: string;
};

export type SearchSolutionsInput = {
  query: string;
  limit: number;
  mode: SearchMode;
};

export type VoteSolutionInput = {
  id: string;
  isUpvote: boolean;
};

export type SolutionResult = {
  id: string;
  problem: string;
  solution: string;
  score: number;
  tags: string | null;
};

export type SolutionBackend = {
  log(input: LogSolutionInput): Promise<{ id: string }>;
  search(input: SearchSolutionsInput): Promise<SolutionResult[]>;
  vote(input: VoteSolutionInput): Promise<void>;
};
