import { describe, expect, it } from "bun:test";

import { getMcpPackageVersion, withToolTelemetry } from "./telemetry";

describe("telemetry", () => {
  it("reads version from package.json", () => {
    expect(getMcpPackageVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("writes stderr JSON on success with augmented meta when CLANKER_MCP_TELEMETRY_TEST=1", async () => {
    const prevFlag = process.env.CLANKER_MCP_TELEMETRY_TEST;
    const chunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stderr.write;

    process.env.CLANKER_MCP_TELEMETRY_TEST = "1";
    try {
      await withToolTelemetry(
        "search_solutions",
        { mode: "hybrid" },
        async () => [1, 2],
        { augmentSuccess: (r) => ({ result_count: r.length }) },
      );
    } finally {
      process.stderr.write = originalWrite;
      if (prevFlag === undefined) {
        delete process.env.CLANKER_MCP_TELEMETRY_TEST;
      } else {
        process.env.CLANKER_MCP_TELEMETRY_TEST = prevFlag;
      }
    }

    expect(chunks.length).toBeGreaterThan(0);
    const parsed = JSON.parse(chunks.join("").trim()) as Record<string, unknown>;
    expect(parsed.event).toBe("mcp_tool_invocation");
    expect(parsed.tool).toBe("search_solutions");
    expect(parsed.ok).toBe(true);
    expect(parsed.meta).toEqual({ mode: "hybrid", result_count: 2 });
  });
});
