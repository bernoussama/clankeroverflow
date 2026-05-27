import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const loginPageSource = readFileSync(new URL("./login-page.tsx", import.meta.url), "utf8");

describe("login page", () => {
  it("uses a single GitHub sign-in entry point", () => {
    expect(loginPageSource).toContain("Continue with GitHub");
    expect(loginPageSource).toContain('signIn.social({');
    expect(loginPageSource).toContain('provider: "github"');
    expect(loginPageSource).toContain("window.location.origin");
    expect(loginPageSource).toContain("window.location.search");
    expect(loginPageSource).toContain("try {");
    expect(loginPageSource).toContain("catch (error)");
    expect(loginPageSource).not.toContain("useSearchParams");
    expect(loginPageSource).not.toContain("const { error }");
    expect(loginPageSource).not.toContain("signIn.email");
    expect(loginPageSource).not.toContain("signUp.email");
  });
});
