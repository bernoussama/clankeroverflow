import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const rootProvidersSource = readFileSync(new URL("./providers.tsx", import.meta.url), "utf8");
const appProvidersSource = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");

describe("provider bundle isolation", () => {
  it("keeps data-heavy providers out of the root layout bundle", () => {
    expect(rootProvidersSource).not.toContain("QueryClientProvider");
    expect(rootProvidersSource).not.toContain("WebMCPProvider");
    expect(rootProvidersSource).not.toContain("Toaster");
    expect(rootProvidersSource).not.toContain("@tanstack/react-query-devtools");
  });

  it("loads data-heavy providers only for application routes", () => {
    expect(appProvidersSource).toContain("QueryClientProvider");
    expect(appProvidersSource).toContain("WebMCPProvider");
    expect(appProvidersSource).toContain("Toaster");
    expect(appProvidersSource).toContain("@tanstack/react-query-devtools");
  });
});
