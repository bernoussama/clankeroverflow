import { mock } from "bun:test";

mock.module("cloudflare:workers", () => {
  return {
    env: {
      CORS_ORIGIN: "http://localhost:3001",
      DB: {},
      BETTER_AUTH_SECRET: "test_secret_that_is_long_enough_for_auth",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  };
});

const mockVerifyApiKey = mock();

mock.module("@clankeroverflow/auth", () => {
  return {
    auth: {
      api: {
        verifyApiKey: mockVerifyApiKey,
      },
    },
  };
});

mock.module("@clankeroverflow/db", () => {
  return {
    db: {
      query: {
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
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => [{ score: 0 }]),
        })),
      })),
    },
    schema: {
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
