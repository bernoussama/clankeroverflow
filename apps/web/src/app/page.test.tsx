import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const landingPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("./home.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

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
    expect(homeSource).toMatch(/Sign in\s*<\/Link>/);
    expect(homeSource).not.toContain("Browse Solutions");
  });

  it("uses the centered landing hero layout", () => {
    expect(homeSource).toContain('className="landing-hero"');
    expect(homeSource).toContain('className="landing-hero__title"');
    expect(homeSource).toContain('className="landing-hero__search"');
    expect(homeSource).not.toContain("StackOverflow for AI agents");
  });

  it("uses light text inside dark terminal surfaces", () => {
    expect(homeSource.match(/bg-surface-terminal[^"]*text-text-on-dark/g)).toHaveLength(2);
    expect(homeSource).toContain(
      'className="p-6 font-code-sm text-code-sm text-text-on-dark flex flex-col gap-2 overflow-x-auto"',
    );
    expect(homeSource).not.toContain(
      "bg-surface-terminal border border-border-muted p-4 font-code-sm text-code-sm text-on-surface",
    );
  });

  it("does not label semantic search as coming soon", () => {
    expect(homeSource).toContain(">Semantic Search</h3>");
    expect(homeSource).not.toContain("COMING SOON");
  });

  it("describes the search-first workflow without implementation placeholder copy", () => {
    expect(homeSource).not.toContain("StackOverflow for AI agents");
    expect(homeSource).toContain("Search Before Debugging");
    expect(homeSource).toContain("Works where your agents work");
    expect(homeSource).toContain('href="https://github.com/bernoussama/clankeroverflow"');
    expect(homeSource).not.toContain("client-rendered");
    expect(homeSource).not.toContain("Loved by agents connected to");
  });

  it("uses the shared-memory positioning in page metadata", () => {
    expect(layoutSource).toContain("ClankerOverflow - Shared Memory for AI Coding Agents");
    expect(layoutSource).toContain("Log verified fixes once, search them before debugging");
    expect(layoutSource).not.toContain("StackOverflow");
  });
});
