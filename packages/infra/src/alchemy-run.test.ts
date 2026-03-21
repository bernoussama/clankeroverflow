import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

const alchemyRunSource = readFileSync(new URL("../alchemy.run.ts", import.meta.url), "utf8");

describe("infra worker config", () => {
  it("adopts the existing web worker during deploys", () => {
    expect(alchemyRunSource).toContain('Nextjs("web", {');
    expect(alchemyRunSource).toContain("adopt: true");
  });

  it("binds production custom domains for web and server", () => {
    expect(alchemyRunSource).toContain('domainName: "clankeroverflow.com"');
    expect(alchemyRunSource).toContain('domainName: "www.clankeroverflow.com"');
    expect(alchemyRunSource).toContain('domainName: "api.clankeroverflow.com"');
    expect(alchemyRunSource).toContain("domains:");
  });
});
