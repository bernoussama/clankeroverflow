import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const loginPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("login page", () => {
  it("offers GitHub OAuth and passkey sign-in", () => {
    expect(loginPageSource).toContain("Continue with GitHub");
    expect(loginPageSource).toContain('signIn.social({');
    expect(loginPageSource).toContain('provider: "github"');
    expect(loginPageSource).toContain("window.location.origin");
    expect(loginPageSource).toContain("window.location.search");
    expect(loginPageSource).toContain("try {");
    expect(loginPageSource).toContain("catch (error)");
    expect(loginPageSource).toContain("signIn.passkey");
    expect(loginPageSource).toContain("Sign in with passkey");
    expect(loginPageSource).not.toContain("useSearchParams");
    expect(loginPageSource).not.toContain("const { error }");
    expect(loginPageSource).not.toContain("signIn.email");
    expect(loginPageSource).not.toContain("signUp.email");
  });

  it("preloads conditional UI passkeys when the browser supports it", () => {
    expect(loginPageSource).toContain("PublicKeyCredential");
    expect(loginPageSource).toContain("isConditionalMediationAvailable");
    expect(loginPageSource).toContain("signIn.passkey({ autoFill: true })");
  });

  it("runs explicit passkey sign-in with autoFill false and handles { data, error }", () => {
    expect(loginPageSource).toContain("autoFill: false");
    expect(loginPageSource).toContain("if (result.data)");
    expect(loginPageSource).toContain("if (result.error)");
    expect(loginPageSource).toContain('router.replace("/dashboard")');
  });
});
