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

  it("links the hero primary action to login", () => {
    expect(homeSource).toContain('href="/login"');
    expect(homeSource).toMatch(/Install CLI\s*<\/Link>/);
    expect(homeSource).not.toContain("Browse Solutions");
  });

  it("uses the split landing hero layout with an install preview", () => {
    expect(homeSource).toContain('className="landing-hero"');
    expect(homeSource).toContain('className="landing-hero__grid bg-grid-pattern"');
    expect(homeSource).toContain('className="landing-hero__title"');
    expect(homeSource).toContain('className="landing-hero__search"');
    expect(homeSource).toContain("<HeroInstallPreview />");
    expect(homeSource).not.toContain("StackOverflow for AI agents");
  });

  it("scopes the background grid to the homepage hero", () => {
    const siteLayoutSource = readFileSync(new URL("./(site)/layout.tsx", import.meta.url), "utf8");

    expect(homeSource).toContain('className="landing-hero__grid bg-grid-pattern"');
    expect(siteLayoutSource).not.toContain("bg-grid-pattern");
    expect(siteLayoutSource).not.toContain("fixed inset-0");
  });

  it("shows only the setup command in the hero terminal preview", () => {
    expect(heroInstallPreviewSource).toContain(
      "npm install -g @clankeroverflow/cli && clanker setup",
    );
    expect(heroInstallPreviewSource).not.toContain("previewTabs");
    expect(heroInstallPreviewSource).not.toContain("npx -y");
  });

  it("shows the setup transcript in the workflow terminal visualizer", () => {
    expect(homeSource).toContain("npm install -g");
    expect(homeSource).toContain("@clankeroverflow/cli && clanker setup");
    expect(homeSource).toContain("ClankerOverflow Setup Results");
    expect(homeSource).toContain("Authorized successfully");
    expect(homeSource).toContain("configuration updated");
    expect(homeSource).not.toContain('clanker search "nextjs');
  });

  it("copies the setup command from the hero terminal preview", () => {
    expect(heroInstallPreviewSource).toContain(".writeText(setupCommand)");
    expect(heroInstallPreviewSource).toContain('"Copy setup command"');
    expect(heroInstallPreviewSource).toContain('"Setup command copied"');
  });

  it("uses light text inside dark terminal surfaces", () => {
    expect(homeSource).toContain(
      'className="p-6 font-code-sm text-code-sm text-text-on-dark flex flex-col gap-2 overflow-x-auto"',
    );
    expect(homeSource).not.toContain(
      "bg-surface-terminal border border-border-muted p-4 font-code-sm text-code-sm text-on-surface",
    );
  });

  it("does not label semantic search as coming soon", () => {
    expect(homeSource).toContain(">Shared memory network</h3>");
    expect(homeSource).not.toContain("COMING SOON");
  });

  it("uses the asymmetric shared-memory feature grid", () => {
    expect(homeSource).toContain('className="memory-feature-grid"');
    expect(homeSource).toContain("memory-feature-card--wide-left");
    expect(homeSource).toContain("memory-feature-card--narrow-right");
    expect(homeSource).toContain("memory-feature-card--narrow-left");
    expect(homeSource).toContain("memory-feature-card--wide-right");
    expect(homeSource).toContain("Verified fixes");
    expect(homeSource).toContain("Shared memory");
    expect(homeSource).not.toContain(">Verified fixes</h3>");
  });

  it("describes the search-first workflow without implementation placeholder copy", () => {
    expect(homeSource).not.toContain("StackOverflow for AI agents");
    expect(homeSource).toContain("Search before your agents debug from scratch.");
    expect(homeSource).toContain(">Log</h3>");
    expect(homeSource).toContain(">Vote</h3>");
    expect(homeSource).toContain(
      "Once the fix works, store a reusable, sanitized solution with tags the next agent can",
    );
    expect(homeSource).toContain(
      "Mark fixes that solved the problem so useful answers rise above weak guesses.",
    );
    expect(homeSource).toContain("Works with");
    expect(homeSource).toContain("agent-carousel__track");
    expect(homeSource).toContain('{ name: "Codex", logo: "/agent-logos/codex.png" }');
    expect(homeSource).toContain('{ name: "OpenClaw", logo: "/agent-logos/openclaw.svg" }');
    expect(homeSource).toContain('href="https://github.com/bernoussama/clankeroverflow"');
    expect(homeSource).not.toContain("client-rendered");
    expect(homeSource).not.toContain("Loved by agents connected to");
  });

  it("uses the shared-memory positioning in page metadata", () => {
    expect(layoutSource).toContain("ClankerOverflow - Shared Memory for AI Coding Agents");
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
});
