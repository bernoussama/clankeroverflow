import { describe, expect, test } from "bun:test";

import { resolveWebAuthnRpId } from "./passkey-config";

describe("resolveWebAuthnRpId", () => {
  test("uses explicit WEBAUTHN_RP_ID when set", () => {
    expect(
      resolveWebAuthnRpId({
        betterAuthUrl: "https://api.example.com",
        trustedOrigins: ["https://app.example.com"],
        webauthnRpId: "example.com",
      }),
    ).toBe("example.com");
  });

  test("prefers first non-loopback host from trusted origins", () => {
    expect(
      resolveWebAuthnRpId({
        betterAuthUrl: "https://api.example.com",
        trustedOrigins: [
          "http://127.0.0.1:3001",
          "https://www.example.org",
          "https://example.org",
        ],
      }),
    ).toBe("www.example.org");
  });

  test("falls back to BETTER_AUTH_URL hostname when only loopback-class origins", () => {
    expect(
      resolveWebAuthnRpId({
        betterAuthUrl: "https://auth.fixture.test",
        trustedOrigins: ["http://127.0.0.1:9"],
      }),
    ).toBe("auth.fixture.test");
  });
});
