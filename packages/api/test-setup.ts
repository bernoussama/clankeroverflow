// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import { vi } from "vitest";

vi.mock("cloudflare:workers", () => {
  return {
    env: {
      CORS_ORIGIN: "http://localhost:3001",
      HYPERDRIVE: {
        connectionString:
          process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clankeroverflow",
      },
      BETTER_AUTH_SECRET: "test_secret",
      BETTER_AUTH_URL: "http://localhost:3000",
      GITHUB_CLIENT_ID: "test-github-client-id",
      GITHUB_CLIENT_SECRET: "test-github-client-secret",
    },
  };
});

vi.mock("@clankeroverflow/db", () => {
  const db = {
    query: {
      apiKey: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      solution: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      solutionVote: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(() => {
      const chain: any = {};
      const mockResult = [{ upvotes: 0, downvotes: 0 }];
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.orderBy = vi.fn(() => chain);
      chain.limit = vi.fn(() => chain.__result ?? mockResult);
      chain.then = (resolve: (value: unknown) => unknown) => resolve(chain.__result ?? mockResult);
      chain.__result = mockResult;
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
        then: (resolve: (value: unknown) => unknown) => resolve(undefined),
      })),
    })),
    execute: vi.fn(),
    update: vi.fn(() => {
      const chain: any = {};
      chain.set = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.returning = vi.fn(() => Promise.resolve([{}]));
      chain.then = (resolve: (value: unknown) => unknown) => resolve([{}]);
      return chain;
    }),
    delete: vi.fn(() => {
      const chain: any = {};
      chain.where = vi.fn(() => chain);
      chain.returning = vi.fn(() => Promise.resolve([{}]));
      chain.then = (resolve: (value: unknown) => unknown) => resolve([{}]);
      return chain;
    }),
  };

  return {
    getDb: () => db,
    schema: {
      apiKey: {
        id: "id",
        key: "key",
        name: "name",
        userId: "userId",
      },
      solution: {
        id: "id",
        score: "score",
        problem: "problem",
        solution: "solution",
        tags: "tags",
        userId: "userId",
        createdAt: "createdAt",
        updatedAt: "updatedAt",
      },
      solutionVote: {
        userId: "userId",
        solutionId: "solutionId",
        isUpvote: "isUpvote",
      },
    },
  };
});
