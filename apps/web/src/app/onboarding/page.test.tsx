import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const onboardingPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("onboarding page rendering", () => {
  it("keeps auth checks client-side", () => {
    expect(onboardingPageSource).not.toContain('from "next/headers"');
    expect(onboardingPageSource).not.toContain('from "next/navigation"');
    expect(onboardingPageSource).not.toContain("authClient.getSession");
    expect(onboardingPageSource).toContain("<AppProviders>");
    expect(onboardingPageSource).toContain("<Onboarding />");
  });
});
