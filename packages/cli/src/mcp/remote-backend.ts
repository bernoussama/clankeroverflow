import type {
  LogSolutionInput,
  SearchSolutionsInput,
  SolutionBackend,
  SolutionResult,
  VoteSolutionInput,
} from "./backend";
import { createTrpcClient } from "./trpc";

export class RemoteBackend implements SolutionBackend {
  private trpc: ReturnType<typeof createTrpcClient>;

  constructor(options: { serverUrl: string; apiKey: string }) {
    this.trpc = createTrpcClient(options);
  }

  async log(input: LogSolutionInput): Promise<{ id: string }> {
    return this.trpc.solutions.log.mutate(input);
  }

  async search(input: SearchSolutionsInput): Promise<SolutionResult[]> {
    return this.trpc.solutions.search.query({
      ...input,
      ...(input.mode === "keyword" ? { keywordStrategy: input.keywordStrategy ?? "tiered" } : {}),
    });
  }

  async searchExactKeyword(input: { query: string; limit: number }) {
    return this.trpc.solutions.search.query({
      ...input,
      mode: "keyword",
      keywordStrategy: "exact",
    });
  }

  async vote(input: VoteSolutionInput): Promise<void> {
    await this.trpc.solutions.vote.mutate(input);
  }
}
