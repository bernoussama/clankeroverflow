// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - bun:test is available at runtime but types may not be present
import { mock } from "bun:test";

mock.module("cloudflare:workers", () => {
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

mock.module("@clankeroverflow/db", () => {
  const db = {
    query: {
      apiKey: {
        findMany: mock(),
        findFirst: mock(),
      },
      solution: {
        findFirst: mock(),
        findMany: mock(),
      },
      solutionVote: {
        findFirst: mock(),
      },
    },
    select: mock(() => {
      const chain: any = {};
      const mockResult = [{ upvotes: 0, downvotes: 0 }];
      chain.from = mock(() => chain);
      chain.where = mock(() => chain);
      chain.orderBy = mock(() => chain);
      chain.limit = mock(() => chain.__result ?? mockResult);
      chain.then = (resolve: (value: unknown) => unknown) => resolve(chain.__result ?? mockResult);
      chain.__result = mockResult;
      return chain;
    }),
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([])),
        then: (resolve: (value: unknown) => unknown) => resolve(undefined),
      })),
    })),
    execute: mock(),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(),
      })),
    })),
    delete: mock(() => ({
      where: mock(),
    })),
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
