import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const landingSources = [
  readFileSync(new URL("./app/(site)/home.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./components/header.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./components/mode-toggle.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./components/user-menu.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./components/mobile-nav.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./components/footer.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./components/hero-buttons.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./components/terminal-command-glow.tsx", import.meta.url), "utf8"),
].join("\n");

describe("design system (index.css)", () => {
  it("uses the exact class-based Tailwind dark variant", () => {
    expect(css).toContain("@custom-variant dark (&:is(.dark *));");
  });

  describe("landing tokens are defined for both light and dark", () => {
    const tokens = [
      "--landing-accent",
      "--landing-accent-subtle",
      "--landing-surface",
      "--landing-border",
      "--landing-grid",
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

  describe("tokenized Tailwind aliases exist", () => {
    const requiredAliases = [
      "--color-surface",
      "--color-surface-container-low",
      "--color-surface-container",
      "--color-surface-container-highest",
      "--color-on-surface",
      "--color-on-surface-variant",
      "--color-outline",
      "--color-outline-variant",
      "--color-primary-container",
      "--color-landing-accent",
      "--spacing-gutter-grid",
    ];

    for (const alias of requiredAliases) {
      it(`defines ${alias}`, () => {
        expect(css).toContain(alias);
      });
    }
  });

  it("uses the requested global dark background", () => {
    const darkBlock = css.match(/\.dark\s*\{([^}]+)\}/)?.[1] ?? "";

    expect(darkBlock).toContain("--background: hsl(0, 9%, 7%);");
    expect(darkBlock).toContain("--theme-surface: hsl(0, 9%, 7%);");
    expect(darkBlock).toContain("--header-bg: hsla(0, 9%, 7%, 0.9);");
  });

  it("applies the tokenized app background to the full page root", () => {
    const htmlBlock = css.match(/html\s*\{([^}]+)\}/)?.[1] ?? "";
    const bodyBlock = css.match(/body\s*\{([^}]+)\}/)?.[1] ?? "";

    expect(htmlBlock).toContain("@apply font-sans bg-background text-foreground;");
    expect(bodyBlock).toContain("@apply font-sans bg-background text-foreground;");
  });

  it("keeps the landing pilot off legacy component CSS recipes", () => {
    const legacyClasses = [
      "mode-toggle-btn",
      "dropdown-content",
      "btn-glow",
      "terminal-cmd-glow",
      "hero-title-gradient",
      "bg-rays",
      "bento-grid",
      "landing-footer__",
    ];

    for (const cls of legacyClasses) {
      expect(landingSources).not.toContain(cls);
    }
  });

  it("uses Inter for landing page body text", () => {
    const landingPageBlock = css.match(/\.landing-page\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(landingPageBlock).toContain('font-family: var(--font-sans), "Inter", sans-serif;');
  });

  it("uses Inter for the landing hero headline", () => {
    const heroTitleBlock = css.match(/\.landing-hero__title\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(heroTitleBlock).toContain('font-family: var(--font-sans), "Inter", sans-serif;');
    expect(heroTitleBlock).toContain("font-size: clamp(3rem, 6.5vw, 5.5rem);");
    expect(heroTitleBlock).toContain("line-height: 1.04;");
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
