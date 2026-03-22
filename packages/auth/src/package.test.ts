import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const authSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("packages/auth adapter wiring", () => {
  it("uses the shared db schema export for joined Better Auth queries", () => {
    expect(authSource).toContain(
      'import { getDb, schema, type Database } from "@clankeroverflow/db";',
    );
    expect(authSource).not.toContain("@clankeroverflow/db/schema/auth");
    expect(authSource).toContain("schema: schema,");
  });

  it("does not enable email and password auth", () => {
    expect(authSource).not.toContain('import { hashPassword, verifyPassword } from "./password";');
    expect(authSource).not.toContain("emailAndPassword:");
  });

  it("configures GitHub as the social auth provider", () => {
    expect(authSource).toContain('basePath: "/auth"');
    expect(authSource).toContain("socialProviders");
    expect(authSource).toContain("github:");
    expect(authSource).toContain('storeStateStrategy: "cookie"');
    expect(authSource).toContain("GITHUB_CLIENT_ID");
    expect(authSource).toContain("GITHUB_CLIENT_SECRET");
  });

  it("shares auth cookies across the production web and api subdomains", () => {
    expect(authSource).toContain("crossSubDomainCookies");
    expect(authSource).toContain("enabled: true");
    expect(authSource).toContain('domain: "clankeroverflow.com"');
  });

  it("wires Cloudflare waitUntil into Better Auth background tasks", () => {
    expect(authSource).toContain("backgroundTasks");
    expect(authSource).toContain("handler: waitUntil");
  });
});
