import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { CLANKEROVERFLOW_MCP_SKILL } from "@/lib/agent-skill-content";
import { HOME_MARKDOWN } from "@/lib/agent-discovery";
import { middleware } from "@/middleware";
import { metadata as dashboardMetadata } from "./app/dashboard/page";
import { metadata as loginMetadata } from "./app/login/page";
import { metadata as onboardingMetadata } from "./app/onboarding/page";
import { metadata as homeMetadata } from "./app/page";
import { generateMetadata as solutionMetadata } from "./app/solution/[id]/page";
import { metadata as solutionsMetadata } from "./app/solutions/page";
import { GET as apiCatalog } from "./app/.well-known/api-catalog/route";
import { GET as agentSkills } from "./app/.well-known/agent-skills/index.json/route";
import { GET as mcpServerCard } from "./app/.well-known/mcp/server-card.json/route";
import { GET as oauthProtectedResource } from "./app/.well-known/oauth-protected-resource/route";
import { GET as robots } from "./app/robots.txt/route";
import { GET as sitemap } from "./app/sitemap.xml/route";

describe("agent discovery endpoints", () => {
  it("pre-renders constant well-known discovery routes", () => {
    const routeFiles = [
      "./app/.well-known/agent-skills/clankeroverflow-mcp/route.ts",
      "./app/.well-known/agent-skills/index.json/route.ts",
      "./app/.well-known/api-catalog/route.ts",
      "./app/.well-known/mcp/server-card.json/route.ts",
      "./app/.well-known/oauth-authorization-server/route.ts",
      "./app/.well-known/oauth-protected-resource/route.ts",
      "./app/.well-known/openid-configuration/route.ts",
    ];

    for (const routeFile of routeFiles) {
      expect(readFileSync(new URL(routeFile, import.meta.url), "utf8")).toContain(
        'export const dynamic = "force-static"',
      );
    }
  });

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

    expect(protectedResource.resource).toBe("https://clankeroverflow.com");
    expect(protectedResource.authorization_servers).toContain(
      "https://api.clankeroverflow.com/auth",
    );
    expect(protectedResource.scopes_supported).toContain("solutions:read");
    expect(protectedResource.scopes_supported).toContain("solutions:write");
    expect(protectedResource.scopes_supported).toContain("openid");
    expect(serverCard.serverInfo.name).toBe("ClankerOverflow MCP Server");
    expect(serverCard.transports[0].command).toBe("npx");
    expect(serverCard.transports[0].args).toEqual(["-y", "@clankeroverflow/cli", "mcp"]);
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
    const response = middleware(
      new NextRequest("https://clankeroverflow.com/", {
        headers: new Headers({ accept: "text/markdown" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("link")).toContain('rel="api-catalog"');
    expect(response.headers.get("link")).toContain("/.well-known/oauth-protected-resource");
    expect(response.headers.get("x-markdown-tokens")).toBeTruthy();
    expect(await response.text()).toBe(HOME_MARKDOWN);
  });
});

describe("canonical URLs", () => {
  it("configures HTTPS canonical metadata for routed pages", async () => {
    await expect(
      solutionMetadata({ params: Promise.resolve({ id: "abc 123" }) }),
    ).resolves.toMatchObject({
      alternates: { canonical: "/solution/abc%20123" },
    });

    const layoutSource = readFileSync(new URL("./app/layout.tsx", import.meta.url), "utf8");

    expect(layoutSource).toContain("metadataBase: new URL(SITE_ORIGIN)");
    expect(homeMetadata.alternates?.canonical).toBe("/");
    expect(solutionsMetadata.alternates?.canonical).toBe("/solutions");
    expect(loginMetadata.alternates?.canonical).toBe("/login");
    expect(dashboardMetadata.alternates?.canonical).toBe("/dashboard");
    expect(onboardingMetadata.alternates?.canonical).toBe("/onboarding");
  });

  it("permanently redirects canonical-host HTTP requests to HTTPS", () => {
    const response = middleware(
      new NextRequest("http://clankeroverflow.com/solutions?sort=top", {
        headers: new Headers({ "x-forwarded-proto": "http" }),
      }),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://clankeroverflow.com/solutions?sort=top");
  });

  it("does not force HTTPS for local development hosts", () => {
    const response = middleware(new NextRequest("http://localhost:3001/solutions"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
