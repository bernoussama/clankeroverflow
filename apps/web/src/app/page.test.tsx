import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const landingPageSource = readFileSync(new URL("./(site)/page.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("./(site)/home.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const heroInstallPreviewSource = readFileSync(
  new URL("../components/hero-install-preview.tsx", import.meta.url),
  "utf8",
);
const heroButtonsSource = readFileSync(
  new URL("../components/hero-buttons.tsx", import.meta.url),
  "utf8",
);

describe("landing page rendering", () => {
  it("is explicitly static", () => {
    expect(landingPageSource).toContain('export const dynamic = "force-static"');
  });

  it("does not fetch solutions on the landing page", () => {
    expect(homeSource).not.toContain('"use client"');
    expect(homeSource).not.toContain("useQuery");
    expect(homeSource).not.toContain("trpcClient");
  });

  it("renders the hero action buttons using the HeroButtons client component", () => {
    expect(homeSource).toContain("<HeroButtons />");
  });

  it("uses the centered landing hero layout with tokenized utilities", () => {
    expect(homeSource).toContain("bg-surface-terminal");
    expect(homeSource).toContain(
      "bg-[linear-gradient(135deg,var(--theme-on-surface),var(--theme-primary-container))]",
    );
    expect(homeSource).not.toContain("hero-title-gradient");
    expect(homeSource).not.toContain("bg-rays");
    expect(homeSource).not.toContain("bento-grid");
    expect(homeSource).not.toContain("StackOverflow for AI agents");
  });

  it("shows only the setup command in the hero terminal preview", () => {
    expect(heroInstallPreviewSource).toContain(
      "npm install -g @clankeroverflow/cli && clanker setup",
    );
    expect(heroInstallPreviewSource).not.toContain("previewTabs");
    expect(heroInstallPreviewSource).not.toContain("npx -y");
    expect(heroInstallPreviewSource).not.toContain("npx @clankeroverflow/cli setup");
  });

  it("copies the setup command from the hero terminal preview", () => {
    expect(heroInstallPreviewSource).toContain(".writeText(setupCommand)");
    expect(heroInstallPreviewSource).toContain('"Copy setup command"');
    expect(heroInstallPreviewSource).toContain('"Setup command copied"');
    expect(heroButtonsSource).toContain("npm install -g @clankeroverflow/cli && clanker setup");
  });

  it("uses custom themed colors inside dark terminal surfaces", () => {
    expect(homeSource).toContain("text-on-surface-variant");
    expect(homeSource).toContain("bg-surface-container-lowest");
    expect(homeSource).not.toContain("text-[#fab985]");
    expect(homeSource).not.toContain("text-emerald-500");
  });

  it("describes search modes without model-quality hype", () => {
    expect(homeSource.replace(/\s+/g, "")).toContain("Keyword,semantic,andhybridsearch</h3>");
    expect(homeSource).not.toContain("COMING SOON");
    expect(homeSource).not.toContain("state-of-the-art");
  });

  it("describes the shared-memory workflow without implementation placeholder copy", () => {
    expect(homeSource).not.toContain("StackOverflow for AI agents");
    expect(homeSource).toContain("Shared memory for");
    expect(homeSource).toContain("AI coding agents");
    expect(homeSource).toContain("Search before your agents debug from scratch");
    expect(homeSource).toContain("Search");
    expect(homeSource).toContain("Verify");
    expect(homeSource).toContain("Log");
    expect(homeSource).toContain("Vote");
    expect(homeSource).toContain("Shared memory network");
    expect(homeSource).not.toContain("client-rendered");
  });

  it("avoids unsupported landing-page claims", () => {
    expect(homeSource).not.toContain("Native IDE Plugins");
    expect(homeSource).not.toContain("VS Code");
    expect(homeSource).not.toContain("JetBrains");
    expect(homeSource).not.toContain("Neovim");
    expect(homeSource).not.toContain("Enterprise Grade");
    expect(homeSource).not.toContain("SOC2 compliant");
  });

  it("uses the shared-memory positioning in page metadata", () => {
    expect(layoutSource).toContain(
      "ClankerOverflow - Shared Debugging Memory for AI Coding Agents",
    );
    expect(layoutSource).toContain("shared memory for verified fixes");
    expect(layoutSource).not.toContain("StackOverflow");
  });

  it("disables Zod JIT before client bundles execute under the strict CSP", () => {
    expect(layoutSource).toContain('id="zod-jitless"');
    expect(layoutSource).toContain("<head>");
    expect(layoutSource).toContain("dangerouslySetInnerHTML");
    expect(layoutSource).toContain("globalThis.__zod_globalConfig");
    expect(layoutSource).toContain("jitless: true");
  });

  it("bootstraps the stored or system theme before hydration", () => {
    expect(layoutSource).toContain("themeBootstrapScript");
    expect(layoutSource).toContain('id="theme-bootstrap"');
    expect(layoutSource).toContain("suppressHydrationWarning");
    expect(layoutSource.indexOf('id="theme-bootstrap"')).toBeLessThan(
      layoutSource.indexOf('id="zod-jitless"'),
    );
  });
});
