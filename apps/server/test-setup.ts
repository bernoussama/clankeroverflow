import { mock } from "bun:test";

mock.module("cloudflare:workers", () => {
  return {
    env: {
      CORS_ORIGIN: "https://cors.test",
      HYPERDRIVE: {
        connectionString:
          process.env.DATABASE_URL ??
          "postgres://postgres:postgres@localhost:5432/clankeroverflow",
      },
      BETTER_AUTH_SECRET: "test_secret",
      BETTER_AUTH_URL: "https://auth.test",
    },
  };
});
