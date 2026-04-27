import { mock } from "bun:test";

const fakeDb = {
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

const createDbMock = mock(async () => ({
  close: async () => {},
  db: fakeDb,
}));

const createAuthMock = mock(() => ({
  handler: () => new Response("OK"),
  api: {
    getSession: mock().mockResolvedValue(null),
  },
}));

/** Pass as the third argument to `app.request(...)` so `c.env` matches Worker bindings. */
export const mockWorkerEnv = {
  CORS_ORIGIN: "https://www.clankeroverflow.com,https://clankeroverflow.com",
  HYPERDRIVE: {
    connectionString:
      process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clankeroverflow",
  },
  BETTER_AUTH_SECRET: "test_secret",
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "test-github-client-id",
  GITHUB_CLIENT_SECRET: "test-github-client-secret",
  AI: undefined as unknown,
  SOLUTION_VECTORS: undefined as unknown,
  POSTHOG_API_KEY: "test-posthog-key",
  POSTHOG_HOST: "https://eu.i.posthog.com",
};

const posthogInstances: any[] = [];

class PostHogMock {
  apiKey: string;
  options: Record<string, unknown>;
  capture = mock();
  captureException = mock();
  identify = mock();
  shutdown = mock(async () => {});

  constructor(apiKey: string, options: Record<string, unknown>) {
    this.apiKey = apiKey;
    this.options = options;
    posthogInstances.push(this);
  }
}

(globalThis as any).__serverTestMocks = {
  createAuthMock,
  createDbMock,
  posthogInstances,
};

mock.module("cloudflare:workers", () => {
  return {
    env: mockWorkerEnv,
  };
});

mock.module("posthog-node", () => {
  return {
    PostHog: PostHogMock,
  };
});

mock.module("@clankeroverflow/db", () => {
  return {
    createDb: createDbMock,
    getDb: () => fakeDb,
    schema: {
      apiKey: {
        id: "id",
        key: "key",
        name: "name",
        userId: "userId",
        createdAt: "createdAt",
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

mock.module("@clankeroverflow/auth", () => {
  return {
    createAuth: createAuthMock,
  };
});
