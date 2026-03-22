import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const authClientSource = readFileSync(new URL("./auth-client.ts", import.meta.url), "utf8");

describe("auth client", () => {
  it("targets the custom /auth Better Auth base path", () => {
    expect(authClientSource).toContain('baseURL: `${env.NEXT_PUBLIC_SERVER_URL}/auth`');
  });
});
