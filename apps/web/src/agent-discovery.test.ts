import { createHash } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { CLANKEROVERFLOW_MCP_SKILL } from "@/lib/agent-skill-content";
import { HOME_MARKDOWN } from "@/lib/agent-discovery";
import { proxy } from "@/proxy";
import { GET as apiCatalog } from "./app/.well-known/api-catalog/route";
import { GET as agentSkills } from "./app/.well-known/agent-skills/index.json/route";
import { GET as mcpServerCard } from "./app/.well-known/mcp/server-card.json/route";
import { GET as oauthProtectedResource } from "./app/.well-known/oauth-protected-resource/route";
import { GET as robots } from "./app/robots.txt/route";
import { GET as sitemap } from "./app/sitemap.xml/route";

describe("agent discovery endpoints", () => {
  it("serves robots.txt with generic, AI crawler, content signal, and sitemap rules", async () => {
    const response = robots();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("User-agent: *");
    expect(body).toContain("User-agent: GPTBot");
    expect(body).toContain("User-agent: Claude-Web");
    expect(body).toContain("User-agent: Google-Extended");
    expect(body).toContain("Disallow: /dashboard");
    expect(body).toContain("Content-Signal: ai-train=no, search=yes, ai-input=no");
    expect(body).toContain("Sitemap: https://clankeroverflow.com/sitemap.xml");
  });

  it("serves sitemap.xml with canonical public URLs", async () => {
    const response = sitemap();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("<loc>https://clankeroverflow.com/</loc>");
    expect(body).toContain("<loc>https://clankeroverflow.com/solutions</loc>");
    expect(body).toContain("<loc>https://clankeroverflow.com/login</loc>");
  });

  it("publishes an RFC 9727 API catalog linkset", async () => {
    const response = apiCatalog();
    const body = await response.json();

    expect(response.headers.get("content-type")).toContain("application/linkset+json");
    expect(body.linkset[0].anchor).toBe("https://api.clankeroverflow.com");
    expect(body.linkset[0]["service-desc"][0].href).toBe("https://api.clankeroverflow.com/trpc");
    expect(body.linkset[0]["service-doc"][0].href).toBe(
      "https://clankeroverflow.com/opencode/clankeroverflow.md",
    );
    expect(body.linkset[0].status[0].href).toBe("https://api.clankeroverflow.com/trpc/healthCheck");
  });

  it("publishes protected resource metadata and an MCP server card", async () => {
    const protectedResource = await oauthProtectedResource().json();
    const serverCard = await mcpServerCard().json();

    expect(protectedResource.resource).toBe("https://api.clankeroverflow.com");
    expect(protectedResource.authorization_servers).toContain("https://api.clankeroverflow.com/auth");
    expect(protectedResource.scopes_supported).toContain("solutions:write");
    expect(serverCard.serverInfo.name).toBe("ClankerOverflow MCP Server");
    expect(serverCard.transports[0].command).toBe("npx");
    expect(serverCard.capabilities.tools).toContain("search_solutions");
  });

  it("publishes an agent skills index with a matching sha256 digest", async () => {
    const response = await agentSkills();
    const body = await response.json();
    const expectedDigest = createHash("sha256").update(CLANKEROVERFLOW_MCP_SKILL).digest("hex");

    expect(body.$schema).toContain("agent-skills-index-v0.2.0");
    expect(body.skills[0].name).toBe("clankeroverflow-mcp");
    expect(body.skills[0].url).toBe(
      "https://clankeroverflow.com/.well-known/agent-skills/clankeroverflow-mcp",
    );
    expect(body.skills[0].sha256).toBe(expectedDigest);
  });
});

describe("markdown negotiation", () => {
  it("returns markdown for agents that request text/markdown on the homepage", async () => {
    const response = proxy({
      headers: new Headers({ accept: "text/markdown" }),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("link")).toContain("rel=\"api-catalog\"");
    expect(response.headers.get("x-markdown-tokens")).toBeTruthy();
    expect(await response.text()).toBe(HOME_MARKDOWN);
  });
});
