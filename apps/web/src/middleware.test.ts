import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const middlewareSource = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");

describe("middleware matcher", () => {
  it("excludes static auth pages from middleware execution", () => {
    expect(middlewareSource).toContain("login");
    expect(middlewareSource).toContain("cli-auth");
    expect(middlewareSource).toContain("_next/static");
    expect(middlewareSource).toContain("_next/image");
  });
});
