import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appProvidersSource = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
const rootLayoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const siteLayoutSource = readFileSync(new URL("../app/(site)/layout.tsx", import.meta.url), "utf8");
const authLayoutSource = readFileSync(new URL("../app/(auth)/layout.tsx", import.meta.url), "utf8");

describe("provider bundle isolation", () => {
  it("keeps data-heavy providers out of the root layout bundle", () => {
    expect(rootLayoutSource).not.toContain("QueryClientProvider");
    expect(rootLayoutSource).not.toContain("WebMCPProvider");
    expect(rootLayoutSource).not.toContain("Toaster");
    expect(rootLayoutSource).not.toContain("@tanstack/react-query-devtools");
  });

  it("loads data-heavy providers only for application routes", () => {
    expect(appProvidersSource).toContain("QueryClientProvider");
    expect(appProvidersSource).toContain("WebMCPProvider");
    expect(appProvidersSource).toContain("Toaster");
    expect(appProvidersSource).toContain("@tanstack/react-query-devtools");
  });

  it("keeps the root shell limited to theme support", () => {
    expect(rootLayoutSource).toContain("ThemeProvider");
    expect(rootLayoutSource).not.toContain("PostHogAnalytics");
    expect(rootLayoutSource).not.toContain("<Header");
    expect(rootLayoutSource).not.toContain("<Footer");
  });

  it("loads site chrome and analytics only in the site route group", () => {
    expect(siteLayoutSource).toContain("PostHogAnalytics");
    expect(siteLayoutSource).toContain("<Header");
    expect(siteLayoutSource).toContain("<Footer");
  });

  it("keeps auth routes on the minimal auth shell", () => {
    expect(authLayoutSource).toContain("ToastProvider");
    expect(authLayoutSource).not.toContain("PostHogAnalytics");
    expect(authLayoutSource).not.toContain("<Header");
    expect(authLayoutSource).not.toContain("<Footer");
    expect(authLayoutSource).not.toContain("AppProviders");
  });
});
