import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const authSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("packages/auth adapter wiring", () => {
  it("uses the shared db schema export for joined Better Auth queries", () => {
    expect(authSource).toContain("import { getDb, schema, type Database } from \"@clankeroverflow/db\";");
    expect(authSource).not.toContain("@clankeroverflow/db/schema/auth");
    expect(authSource).toContain("schema: schema,");
  });

  it("uses worker-friendly password hashing for email auth", () => {
    expect(authSource).toContain('import { hashPassword, verifyPassword } from "./password";');
    expect(authSource).toContain("password: {");
    expect(authSource).toContain("hash: hashPassword,");
    expect(authSource).toContain("verify: verifyPassword,");
  });

  it("shares auth cookies across the production web and api subdomains", () => {
    expect(authSource).toContain("crossSubDomainCookies");
    expect(authSource).toContain("enabled: true");
    expect(authSource).toContain('domain: "clankeroverflow.com"');
  });
});
