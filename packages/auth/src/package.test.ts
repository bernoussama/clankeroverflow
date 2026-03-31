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
    expect(authSource).toContain("getDefaultCookieAttributes");
    expect(authSource).toContain('hostname === "localhost"');
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

  it("configures the Better Auth API key plugin for ClankerOverflow clients", () => {
    expect(authSource).toContain("plugins:");
    expect(authSource).toContain("apiKey({");
    expect(authSource).toContain('apiKeyHeaders: "x-clanker-api-key"');
    expect(authSource).toContain('defaultPrefix: "clk_"');
    expect(authSource).toContain("requireName: true");
    expect(authSource).toContain("startingCharactersConfig");
    expect(authSource).toContain("charactersLength: 8");
  });

  it("enables WebAuthn passkeys via @better-auth/passkey", () => {
    expect(authSource).toContain('@better-auth/passkey');
    expect(authSource).toContain("passkey({");
    expect(authSource).toContain("rpName:");
    expect(authSource).toContain("resolveWebAuthnRpId");
    expect(authSource).toContain("WEBAUTHN_RP_ID");
  });
});
