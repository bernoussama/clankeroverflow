import { describe, expect, it } from "vitest";

import { THEME_QUERY, THEME_STORAGE_KEY, themeBootstrapScript } from "./theme-bootstrap";

describe("theme bootstrap", () => {
  it("resolves the theme before React hydrates", () => {
    expect(themeBootstrapScript).toContain("document.documentElement");
    expect(themeBootstrapScript).toContain("localStorage.getItem");
    expect(themeBootstrapScript).toContain(THEME_STORAGE_KEY);
    expect(themeBootstrapScript).toContain(THEME_QUERY);
    expect(themeBootstrapScript).toContain("classList.add");
    expect(themeBootstrapScript).toContain("colorScheme");
  });

  it("supports explicit and system theme values", () => {
    expect(themeBootstrapScript).toContain('storedTheme === "light"');
    expect(themeBootstrapScript).toContain('storedTheme === "dark"');
    expect(themeBootstrapScript).toContain('storedTheme === "system"');
    expect(themeBootstrapScript).toContain('theme === "system"');
  });
});
