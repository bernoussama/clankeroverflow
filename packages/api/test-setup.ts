import { mock } from "bun:test";

mock.module("cloudflare:workers", () => {
  return {
    env: {
      CORS_ORIGIN: "http://localhost:3001",
      DB: {},
      BETTER_AUTH_SECRET: "test_secret",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  };
});

mock.module("@clankeroverflow/db", () => {
  return {
    db: {
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
      insert: mock(() => ({
        values: mock(),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(),
        })),
      })),
      delete: mock(() => ({
        where: mock(),
      })),
    },
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

