import { describe, expect, it } from "bun:test";

import { parseAllowedOrigins } from "./origins";

describe("parseAllowedOrigins", () => {
  it("splits comma-separated origins for shared web access", () => {
    expect(
      parseAllowedOrigins("https://www.clankeroverflow.com, https://clankeroverflow.com"),
    ).toEqual(["https://www.clankeroverflow.com", "https://clankeroverflow.com"]);
  });

  it("keeps single-origin configs working", () => {
    expect(parseAllowedOrigins("http://localhost:3001")).toEqual(["http://localhost:3001"]);
  });

  it("normalizes trailing slashes and removes duplicates", () => {
    expect(
      parseAllowedOrigins("https://clankeroverflow.com/, https://clankeroverflow.com"),
    ).toEqual(["https://clankeroverflow.com"]);
  });

  it("fails fast when an entry is not a bare origin", () => {
    expect(() =>
      parseAllowedOrigins("https://clankeroverflow.com/app, https://www.clankeroverflow.com"),
    ).toThrow("Invalid origin");
  });
});
