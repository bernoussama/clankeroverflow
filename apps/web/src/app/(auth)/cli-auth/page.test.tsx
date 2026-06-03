import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const cliAuthPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cliAuthClientSource = readFileSync(new URL("./cli-auth-client.tsx", import.meta.url), "utf8");

describe("CLI auth page", () => {
  it("uses a static server wrapper around the client device approval flow", () => {
    expect(cliAuthPageSource).toContain('export const dynamic = "force-static"');
    expect(cliAuthPageSource).toContain('canonical: "/cli-auth"');
    expect(cliAuthPageSource).toContain("<CliAuthClient />");
    expect(cliAuthPageSource).not.toContain('"use client"');
    expect(cliAuthClientSource).toContain('"use client"');
    expect(cliAuthClientSource).toContain("authClient.device.approve");
    expect(cliAuthClientSource).toContain("authClient.device.deny");
  });
});
