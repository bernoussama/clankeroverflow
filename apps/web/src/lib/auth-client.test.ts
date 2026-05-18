import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const authClientSource = readFileSync(new URL("./auth-client.ts", import.meta.url), "utf8");

describe("auth client", () => {
  it("targets the custom /auth Better Auth base path", () => {
    expect(authClientSource).toContain('baseURL: `${env.NEXT_PUBLIC_SERVER_URL}/auth`');
  });

  it("uses the Better Auth API key client plugin", () => {
    expect(authClientSource).toContain(
      'import { apiKeyClient } from "@better-auth/api-key/client";',
    );
    expect(authClientSource).toContain("apiKeyClient()");
    expect(authClientSource).not.toContain('import { apiKey } from "@better-auth/api-key";');
  });
});
