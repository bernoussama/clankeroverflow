import { createTRPCClient, httpBatchLink } from "@trpc/client";

import type { SolutionResult } from "./backend";

export type HostedTrpcClient = {
  kb: {
    write: {
      mutate(input: {
        title: string;
        problem: string;
        solution: string;
        tags: string[];
        force: boolean;
      }): Promise<{ id: string; warning?: string }>;
    };
    search: {
      query(input: { query: string; limit: number }): Promise<SolutionResult[]>;
    };
    confirm: { mutate(input: { path: string; worked: boolean }): Promise<unknown> };
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
          return options.apiKey ? { "x-clanker-api-key": options.apiKey } : {};
        },
      }),
    ],
  }) as unknown as HostedTrpcClient;
}
