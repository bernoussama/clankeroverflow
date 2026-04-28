import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const envProduction = readFileSync(new URL("../.env.production", import.meta.url), "utf8");

describe("production env", () => {
  it("uses the production custom domains for app-to-api traffic", () => {
    expect(envProduction).toContain("NEXT_PUBLIC_SERVER_URL=https://api.clankeroverflow.com");
    expect(envProduction).toContain("BETTER_AUTH_URL=https://api.clankeroverflow.com");
    expect(envProduction).toContain(
      "CORS_ORIGIN=https://www.clankeroverflow.com,https://clankeroverflow.com",
    );
  });
});
