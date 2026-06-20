import { describe, expect, test } from "vitest";

import { resolveConfig } from "./config";

describe("MCP config", () => {
  test("enables local semantic search by default in local mode", () => {
    expect(resolveConfig({ CLANKER_MODE: "local" }).localSemantic.enabled).toBe(true);
  });

  test("allows local semantic search to be disabled explicitly", () => {
    for (const value of ["0", "false", "off"]) {
      expect(
        resolveConfig({ CLANKER_MODE: "local", CLANKER_LOCAL_SEMANTIC: value }).localSemantic
          .enabled,
      ).toBe(false);
    }
  });

  test("keeps semantic search disabled outside local mode", () => {
    expect(resolveConfig({ CLANKER_LOCAL_SEMANTIC: "1" }).localSemantic.enabled).toBe(false);
  });
});
