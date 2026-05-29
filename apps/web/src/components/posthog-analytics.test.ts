import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const postHogAnalyticsSource = readFileSync(
  new URL("./posthog-analytics.tsx", import.meta.url),
  "utf8",
);

describe("PostHog browser analytics", () => {
  it("loads the proxied classic script without forcing a CORS request", () => {
    expect(postHogAnalyticsSource).toContain('+"/static/array.js"');
    expect(postHogAnalyticsSource).not.toContain('crossOrigin="anonymous"');
  });
});
