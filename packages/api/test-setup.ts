import { mock } from "bun:test";

mock.module("cloudflare:workers", () => {
  return {
    env: {
      CORS_ORIGIN: "http://localhost:3001",
      HYPERDRIVE: {
        connectionString:
          process.env.DATABASE_URL ??
          "postgres://postgres:postgres@localhost:5432/clankeroverflow",
      },
      BETTER_AUTH_SECRET: "test_secret",
      BETTER_AUTH_URL: "http://localhost:3000",
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
    select: mock((...args: any[]) => {
      const chain: any = {};
      const mockResult = [{ upvotes: 0, downvotes: 0 }];
      chain.from = mock(() => chain);
      chain.where = mock(() => chain);
      chain.orderBy = mock(() => chain);
      chain.limit = mock(() => (chain as any).__result ?? mockResult);
      chain.then = (resolve: any) => resolve((chain as any).__result ?? mockResult);
      chain.__result = mockResult;
      return chain;
    }),
    insert: mock(() => ({
      values: mock(),
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
      },
      solutionVote: {
        userId: "userId",
        solutionId: "solutionId",
        isUpvote: "isUpvote",
      },
    },
  };
});
