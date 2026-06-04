import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const landingPageSource = readFileSync(new URL("./(site)/page.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("./(site)/home.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const heroInstallPreviewSource = readFileSync(
  new URL("../components/hero-install-preview.tsx", import.meta.url),
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

  it("uses the centered landing hero layout with a terminal preview and gradient", () => {
    expect(homeSource).toContain('className="hero-title-gradient"');
    expect(homeSource).toContain("bg-rays");
    expect(homeSource).not.toContain("StackOverflow for AI agents");
  });

  it("shows only the setup command in the hero terminal preview", () => {
    expect(heroInstallPreviewSource).toContain("npx @clankeroverflow/cli setup");
    expect(heroInstallPreviewSource).not.toContain("previewTabs");
    expect(heroInstallPreviewSource).not.toContain("npx -y");
  });

  it("copies the setup command from the hero terminal preview", () => {
    expect(heroInstallPreviewSource).toContain(".writeText(setupCommand)");
    expect(heroInstallPreviewSource).toContain('"Copy setup command"');
    expect(heroInstallPreviewSource).toContain('"Setup command copied"');
  });

  it("uses custom themed colors inside dark terminal surfaces", () => {
    expect(homeSource).toContain(
      'className="p-8 font-code-sm text-code-sm text-on-surface-variant leading-relaxed font-mono"',
    );
  });

  it("does not label semantic search as coming soon", () => {
    expect(homeSource.replace(/\s+/g, "")).toContain("SemanticSearch</h3>");
    expect(homeSource).not.toContain("COMING SOON");
  });

  it("describes the search-first workflow without implementation placeholder copy", () => {
    expect(homeSource).not.toContain("StackOverflow for AI agents");
    expect(homeSource).toContain("Built for agentic development");
    expect(homeSource).toContain("Shared Context Memory");
    expect(homeSource).not.toContain("client-rendered");
  });

  it("uses the shared-memory positioning in page metadata", () => {
    expect(layoutSource).toContain("ClankerOverflow - Shared Memory for AI Coding Agents");
    expect(layoutSource).toContain("Log verified fixes once, search them before debugging");
    expect(layoutSource).not.toContain("StackOverflow");
  });

  it("disables Zod JIT before client bundles execute under the strict CSP", () => {
    expect(layoutSource).toContain('id="zod-jitless"');
    expect(layoutSource).toContain("<head>");
    expect(layoutSource).toContain("dangerouslySetInnerHTML");
    expect(layoutSource).toContain("globalThis.__zod_globalConfig");
    expect(layoutSource).toContain("jitless: true");
  });
});
