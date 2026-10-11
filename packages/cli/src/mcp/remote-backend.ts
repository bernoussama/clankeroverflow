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

  close(): void {
    // The hosted backend owns no persistent client-side resources.
  }

  async log(input: LogSolutionInput): Promise<{ id: string; warning?: string }> {
    const tags = (input.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const result = await this.trpc.kb.write.mutate({
      title: input.problem,
      problem: input.problem,
      solution: input.solution,
      tags,
      force: false,
    });
    return { id: result.id, warning: result.warning };
  }

  async search(input: SearchSolutionsInput): Promise<SolutionResult[]> {
    return this.trpc.kb.search.query({ query: input.query, limit: input.limit });
  }

  async searchExactKeyword(input: { query: string; limit: number }) {
    return this.search({ query: input.query, limit: input.limit, mode: "keyword" });
  }

  async vote(input: VoteSolutionInput): Promise<void> {
    await this.trpc.kb.confirm.mutate({ path: input.id, worked: input.isUpvote });
  }
}
