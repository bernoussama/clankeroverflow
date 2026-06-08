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

  it("defers analytics and disables optional heavy browser extensions", () => {
    expect(postHogAnalyticsSource).toContain('strategy="lazyOnload"');
    expect(postHogAnalyticsSource).toContain("usePathname");
    expect(postHogAnalyticsSource).toContain('pathname !== "/"');
    expect(postHogAnalyticsSource).toContain("HOME_ANALYTICS_FALLBACK_DELAY_MS");
    expect(postHogAnalyticsSource).toContain("userInteractionEvents");
    expect(postHogAnalyticsSource).toContain("autocapture:false");
    expect(postHogAnalyticsSource).toContain("capture_pageview:false");
    expect(postHogAnalyticsSource).toContain("disable_session_recording:true");
    expect(postHogAnalyticsSource).toContain("disable_surveys:true");
  });
});
