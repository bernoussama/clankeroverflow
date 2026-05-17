import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { LogSolutionInput, SearchSolutionsInput, SolutionResult, VoteSolutionInput } from "./backend";

export type HostedTrpcClient = {
  solutions: {
    log: { mutate(input: LogSolutionInput): Promise<{ id: string }> };
    search: { query(input: SearchSolutionsInput): Promise<SolutionResult[]> };
    vote: { mutate(input: VoteSolutionInput): Promise<unknown> };
  };
};

export function createTrpcClient(options: { serverUrl: string; apiKey: string }) {
  return createTRPCClient<any>({
    links: [
      httpBatchLink({
        url: `${options.serverUrl}/trpc`,
        fetch(url, fetchOptions) {
          const { signal: _signal, ...rest } = fetchOptions ?? {};
          return fetch(url, rest);
        },
        headers() {
          return {
            ...(options.apiKey ? { "x-clanker-api-key": options.apiKey } : {}),
          };
        },
      }),
    ],
  }) as unknown as HostedTrpcClient;
}
