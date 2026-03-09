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
