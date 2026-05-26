import { vi } from "vitest";

const fakeDb = {
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
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(),
  })),
};

const createDbMock = vi.fn(async () => ({
  close: async () => {},
  db: fakeDb,
}));

const createAuthMock = vi.fn(() => ({
  handler: () => new Response("OK"),
  api: {
    getSession: vi.fn().mockResolvedValue(null),
  },
}));

/** Pass as the third argument to `app.request(...)` so `c.env` matches Worker bindings. */
export const mockWorkerEnv = {
  COMMIT_SHA: "test-commit",
  CORS_ORIGIN: "https://www.clankeroverflow.com,https://clankeroverflow.com",
  ENVIRONMENT: "test",
  HYPERDRIVE: {
    connectionString:
      process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clankeroverflow",
  },
  SERVICE_VERSION: "test-version",
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
  capture = vi.fn();
  captureException = vi.fn();
  identify = vi.fn();
  shutdown = vi.fn(async () => {});

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

vi.mock("cloudflare:workers", () => {
  return {
    env: mockWorkerEnv,
  };
});

vi.mock("@clankeroverflow/api/posthog", () => {
  return {
    createPostHog: (env: { POSTHOG_API_KEY?: string; POSTHOG_HOST?: string }) => {
      if (!env.POSTHOG_API_KEY || !env.POSTHOG_HOST) {
        return undefined;
      }
      return new PostHogMock(env.POSTHOG_API_KEY, {
        host: env.POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 0,
        enableExceptionAutocapture: true,
      });
    },
    shutdownPostHog: (posthog: PostHogMock | undefined) => posthog?.shutdown(),
  };
});

vi.mock("@clankeroverflow/db", () => {
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

vi.mock("@clankeroverflow/auth", () => {
  return {
    createAuth: createAuthMock,
  };
});
