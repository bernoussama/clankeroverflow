import { describe, expect, it, mock } from "bun:test";

import { logTrpcProcedureLine, privacyMetaForSolutionsProcedure } from "./client-request-log";
import type { Context } from "./context";

describe("privacyMetaForSolutionsProcedure", () => {
  it("returns lengths for solutions.log when client is mcp", () => {
    expect(
      privacyMetaForSolutionsProcedure("mcp", "solutions.log", {
        problem: "ab",
        solution: "cd",
        tags: "x",
      }),
    ).toEqual({
      problem_len: 2,
      solution_len: 2,
      has_tags: true,
    });
  });

  it("returns search dimensions without query text", () => {
    expect(
      privacyMetaForSolutionsProcedure("mcp", "solutions.search", {
        query: "secret",
        limit: 5,
        mode: "hybrid",
      }),
    ).toEqual({
      mode: "hybrid",
      limit: 5,
      query_len: 6,
    });
  });

  it("returns undefined for non-mcp clients", () => {
    expect(privacyMetaForSolutionsProcedure("unknown", "solutions.search", { query: "x" })).toBeUndefined();
  });
});

describe("logTrpcProcedureLine", () => {
  it("writes JSON with mcp meta for solutions.search", () => {
    const lines: string[] = [];
    const log = mock((msg: string) => {
      lines.push(msg);
    });

    const original = console.log;
    console.log = log as typeof console.log;

    const ctx = {
      clientKind: "mcp",
      clientMcpVersion: "1.0.1",
    } as Context;

    try {
      logTrpcProcedureLine(ctx, "solutions.search", { query: "hi", limit: 3, mode: "keyword" }, 12, true);
    } finally {
      console.log = original;
    }

    expect(log).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({
      source: "clanker_api",
      event: "trpc_procedure",
      path: "solutions.search",
      duration_ms: 12,
      ok: true,
      client: "mcp",
      mcp_version: "1.0.1",
      meta: { mode: "keyword", limit: 3, query_len: 2 },
    });
  });
});
