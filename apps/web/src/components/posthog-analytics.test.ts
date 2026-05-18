import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const analyticsSource = readFileSync(new URL("./posthog-analytics.tsx", import.meta.url), "utf8");
const providersSource = readFileSync(new URL("./providers.tsx", import.meta.url), "utf8");
const envSource = readFileSync(
  new URL("../../../../packages/env/src/web.ts", import.meta.url),
  "utf8",
);
const infraSource = readFileSync(
  new URL("../../../../packages/infra/alchemy.run.ts", import.meta.url),
  "utf8",
);
const wranglerSource = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");

describe("PostHog web analytics", () => {
  test("loads the browser snippet from public environment variables", () => {
    expect(analyticsSource).toContain("NEXT_PUBLIC_POSTHOG_KEY");
    expect(analyticsSource).toContain("NEXT_PUBLIC_POSTHOG_HOST");
    expect(analyticsSource).toContain("defaults:'2026-01-30'");
    expect(analyticsSource).toContain("posthog.init");
    expect(wranglerSource).toContain(
      '"NEXT_PUBLIC_POSTHOG_HOST": "https://n.clankeroverflow.com"',
    );
  });

  test("identifies and resets users from Better Auth session state", () => {
    expect(analyticsSource).toContain("authClient.useSession");
    expect(analyticsSource).toContain("posthog.identify");
    expect(analyticsSource).toContain("posthog.reset");
  });

  test("is mounted globally in the app providers", () => {
    expect(providersSource).toContain("PostHogAnalytics");
  });

  test("production web deploy exposes public PostHog env vars", () => {
    expect(envSource).toContain("NEXT_PUBLIC_POSTHOG_KEY");
    expect(envSource).toContain("NEXT_PUBLIC_POSTHOG_HOST");
    expect(infraSource).toContain("NEXT_PUBLIC_POSTHOG_KEY: alchemy.env.POSTHOG_API_KEY");
    expect(infraSource).toContain("NEXT_PUBLIC_POSTHOG_HOST: alchemy.env.POSTHOG_HOST");
  });
});
