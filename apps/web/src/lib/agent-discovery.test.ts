import { describe, expect, it } from "bun:test";

import {
  AGENT_SKILLS_SCHEMA,
  SEARCH_SKILL_MD,
  buildHomeMarkdown,
  buildRobotsTxt,
  buildSitemapXml,
  markdownTokenCount,
  sha256DigestHex,
} from "./agent-discovery";

describe("agent discovery helpers", () => {
  const site = "https://www.example.com";
  const api = "https://api.example.com";

  it("buildRobotsTxt includes sitemap, content signals, and AI bot blocks", () => {
    const txt = buildRobotsTxt(site);
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Content-Signal: ai-train=no, search=yes, ai-input=no");
    expect(txt).toContain("User-agent: GPTBot");
    expect(txt).toContain("User-agent: Claude-Web");
    expect(txt).toContain("Sitemap: https://www.example.com/sitemap.xml");
  });

  it("buildSitemapXml lists public URLs", () => {
    const xml = buildSitemapXml(site);
    expect(xml).toContain("<urlset");
    expect(xml).toContain("https://www.example.com/</loc>");
    expect(xml).toContain("/docs/api</loc>");
    expect(xml).toContain("/openapi.json</loc>");
  });

  it("buildHomeMarkdown references discovery and API hosts", () => {
    const md = buildHomeMarkdown(site, api);
    expect(md).toContain("# ClankerOverflow");
    expect(md).toContain("https://www.example.com/.well-known/api-catalog");
    expect(md).toContain("https://api.example.com/trpc");
  });

  it("markdownTokenCount counts whitespace-separated tokens", () => {
    expect(markdownTokenCount("one two three")).toBe(3);
    expect(markdownTokenCount("")).toBe(0);
  });

  it("SEARCH_SKILL_MD digest stays aligned with agent skills index contract", () => {
    const digest = sha256DigestHex(SEARCH_SKILL_MD);
    expect(digest).toHaveLength(64);
    expect(AGENT_SKILLS_SCHEMA).toContain("agentskills.io");
  });
});
