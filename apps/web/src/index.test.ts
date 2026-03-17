import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

describe("design system (index.css)", () => {
  describe("landing tokens are defined for both light and dark", () => {
    const tokens = [
      "--landing-accent",
      "--landing-accent-subtle",
      "--landing-surface",
      "--landing-border",
      "--landing-muted",
      "--landing-code-bg",
      "--landing-code-fg",
    ];

    for (const token of tokens) {
      it(`defines ${token} in :root`, () => {
        const rootBlock = css.match(/:root\s*\{([^}]+)\}/)?.[1] ?? "";
        expect(rootBlock).toContain(token);
      });

      it(`defines ${token} in .dark`, () => {
        const darkBlock = css.match(/\.dark\s*\{([^}]+)\}/)?.[1] ?? "";
        expect(darkBlock).toContain(token);
      });
    }
  });

  describe("app-wide utility classes exist", () => {
    const requiredClasses = [
      ".text-accent-landing",
      ".text-muted-landing",
      ".bg-surface-landing",
      ".border-landing",
      ".page-shell",
      ".page-container",
      ".page-title",
      ".auth-card",
      ".dashboard-card",
      ".dashboard-card__header",
      ".dashboard-card__body",
      ".mode-toggle-btn",
      ".dropdown-content",
      ".input-landing",
      ".text-error",
      ".landing-card",
      ".btn-primary",
      ".btn-secondary",
      ".tag-flat",
      ".code-block",
      ".landing-header",
      ".landing-footer",
      ".section-rule",
      ".solution-item",
      ".feature-row",
      ".font-display",
    ];

    for (const cls of requiredClasses) {
      it(`defines ${cls}`, () => {
        expect(css).toContain(cls);
      });
    }
  });

  describe("no hardcoded hex colors in token values", () => {
    it("does not use #F97316 directly (should use var(--landing-accent))", () => {
      const nonCSSLines = css
        .split("\n")
        .filter((line) => !line.trim().startsWith("--landing-accent"));
      const joined = nonCSSLines.join("\n");
      expect(joined).not.toContain("#F97316");
    });
  });
});
