import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const authSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("packages/auth adapter wiring", () => {
  it("uses the shared db schema export for joined Better Auth queries", () => {
    expect(authSource).toContain("import { getDb, schema, type Database } from \"@clankeroverflow/db\";");
    expect(authSource).not.toContain("@clankeroverflow/db/schema/auth");
    expect(authSource).toContain("schema: schema,");
  });

  it("shares auth cookies across the production web and api subdomains", () => {
    expect(authSource).toContain("crossSubDomainCookies");
    expect(authSource).toContain("enabled: true");
    expect(authSource).toContain('domain: "clankeroverflow.com"');
  });
});
