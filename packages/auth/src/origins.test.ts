import { describe, expect, it } from "vitest";

import {
  LOCAL_SPLIT_ORIGIN_DEV_FALLBACK,
  parseAllowedOrigins,
  parseAllowedOriginsWithDevFallback,
} from "./origins";

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

describe("parseAllowedOriginsWithDevFallback", () => {
  it("uses CORS_ORIGIN from bindings when set", () => {
    expect(
      parseAllowedOriginsWithDevFallback({
        CORS_ORIGIN: "https://a.example,https://b.example",
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  it("falls back to local web origins when CORS_ORIGIN is missing and auth URL is localhost", () => {
    expect(
      parseAllowedOriginsWithDevFallback({
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    ).toEqual(parseAllowedOrigins(LOCAL_SPLIT_ORIGIN_DEV_FALLBACK));
  });

  it("returns empty list when CORS_ORIGIN is missing and auth URL is not local", () => {
    expect(
      parseAllowedOriginsWithDevFallback({
        BETTER_AUTH_URL: "https://api.clankeroverflow.com",
      }),
    ).toEqual([]);
  });

  it("treats undefined bindings like missing CORS with no local auth URL", () => {
    expect(parseAllowedOriginsWithDevFallback(undefined)).toEqual([]);
  });
});
