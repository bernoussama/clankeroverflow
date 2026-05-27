import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const envProduction = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../.env.production"),
  "utf8",
);

describe("production env", () => {
  it("uses the production custom domains for app-to-api traffic", () => {
    expect(envProduction).toContain("NEXT_PUBLIC_SERVER_URL=https://api.clankeroverflow.com");
    expect(envProduction).toContain("BETTER_AUTH_URL=https://api.clankeroverflow.com");
    expect(envProduction).toContain(
      "CORS_ORIGIN=https://www.clankeroverflow.com,https://clankeroverflow.com",
    );
  });
});
