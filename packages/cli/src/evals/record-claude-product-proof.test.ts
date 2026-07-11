import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  claudeArgs,
  claudeCommand,
  parseClaudeToolCalls,
  parseClaudeUsage,
  type ClaudeRecordOptions,
} from "./record-claude-product-proof";

describe("product-proof Claude recorder", () => {
  const options: ClaudeRecordOptions = {
    workspaceDir: "/tmp/product-proof",
    outputPath: "/tmp/product-proof/runs/out.json",
    scenarios: [],
    repetitions: 1,
    effort: "low",
    timeoutMs: 300_000,
    keepTemp: false,
  };

  test("runs with strict benchmark MCP config", () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-claude-recorder-test-"));
    try {
      const mcpConfig = join(dir, "mcp.json");
      writeFileSync(mcpConfig, "{}");
      const args = claudeArgs(options, "with_mcp_known_fix", "prompt", mcpConfig);

      expect(claudeCommand()).toBe(process.env.CLAUDE_BIN || "claude");
      expect(args).toContain("-p");
      expect(args).toContain("--output-format");
      expect(args).toContain("stream-json");
      expect(args).toContain("--strict-mcp-config");
      expect(args).toContain("--mcp-config");
      expect(args).toContain(mcpConfig);
      expect(args).toContain("--no-session-persistence");
      expect(args).toContain("--append-system-prompt");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("parses Claude MCP calls, returned IDs, logged IDs, and usage", () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-claude-recorder-test-"));
    const eventsPath = join(dir, "events.jsonl");
    try {
      writeFileSync(
        eventsPath,
        [
          JSON.stringify({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  id: "call_search",
                  name: "mcp__clankeroverflow__search_solutions",
                  input: { query: "EADDRINUSE", limit: 5 },
                },
              ],
            },
          }),
          JSON.stringify({
            type: "user",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "call_search",
                  content: [{ type: "text", text: "ID: fix-1\n## Solution:\nUse port 0." }],
                },
              ],
            },
          }),
          JSON.stringify({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  id: "call_log",
                  name: "mcp__clankeroverflow__log_solution",
                  input: { problem: "p", solution: "s" },
                },
              ],
            },
          }),
          JSON.stringify({
            type: "user",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "call_log",
                  content: "Success! Solution logged locally: logged-1",
                },
              ],
            },
          }),
          JSON.stringify({
            type: "result",
            duration_ms: 456,
            usage: {
              input_tokens: 10,
              cache_creation_input_tokens: 2,
              cache_read_input_tokens: 3,
              output_tokens: 4,
            },
          }),
        ].join("\n"),
      );

      expect(parseClaudeToolCalls(eventsPath)).toEqual([
        {
          name: "search_solutions",
          arguments: { query: "EADDRINUSE", limit: 5 },
          result_ids: ["fix-1"],
          logged_ids: [],
        },
        {
          name: "log_solution",
          arguments: { problem: "p", solution: "s" },
          result_ids: [],
          logged_ids: ["logged-1"],
        },
      ]);
      expect(parseClaudeUsage(eventsPath, 123)).toEqual({
        input_tokens: 15,
        cached_input_tokens: 3,
        output_tokens: 4,
        reasoning_output_tokens: 0,
        total_provider_tokens: 19,
        elapsed_ms: 456,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
