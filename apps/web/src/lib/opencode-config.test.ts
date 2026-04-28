import { readFileSync } from "node:fs";

import { describe, expect, it } from "bun:test";

import {
  buildOpenCodeConfig,
  CLANKER_OPENCODE_INSTRUCTIONS_URL,
  OPENCODE_SCHEMA_URL,
} from "./opencode-config";

describe("OpenCode config helpers", () => {
  it("includes the hosted workflow instructions in generated config", () => {
    const parsed = JSON.parse(buildOpenCodeConfig("clk_test")) as {
      $schema: string;
      instructions: string[];
      mcp: {
        clankeroverflow: {
          environment: {
            CLANKER_API_KEY: string;
            CLANKER_SERVER_URL: string;
          };
        };
      };
    };

    expect(parsed.$schema).toBe(OPENCODE_SCHEMA_URL);
    expect(parsed.instructions).toEqual([CLANKER_OPENCODE_INSTRUCTIONS_URL]);
    expect(parsed.mcp.clankeroverflow.environment.CLANKER_API_KEY).toBe("clk_test");
    expect(parsed.mcp.clankeroverflow.environment.CLANKER_SERVER_URL).toBe(
      "https://api.clankeroverflow.com",
    );
  });

  it("publishes hosted instructions that tell OpenCode to search first and log verified fixes", () => {
    const instructions = readFileSync(
      new URL("../../public/opencode/clankeroverflow.md", import.meta.url),
      "utf8",
    );

    expect(instructions).toContain("Search ClankerOverflow first");
    expect(instructions).toContain("Do not wait for the user to explicitly ask");
    expect(instructions).toContain("log it with `log_solution`");
  });
});
