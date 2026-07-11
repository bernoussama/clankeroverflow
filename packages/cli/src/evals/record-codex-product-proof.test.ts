import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
  codexArgs,
  codexCommand,
  createCodexEnvironment,
  isUsageLimitRun,
  parseToolCalls,
  parseUsage,
  type RecordOptions,
} from "./record-codex-product-proof";

describe("product-proof Codex recorder", () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const options: RecordOptions = {
    workspaceDir: "/tmp/product-proof",
    outputPath: "/tmp/product-proof/runs/out.json",
    scenarios: [],
    repetitions: 1,
    reasoningEffort: "low",
    timeoutMs: 300_000,
    keepTemp: false,
  };

  test("runs the known-fix config against the workspace MCP server", () => {
    const args = codexArgs(options, "with_mcp_known_fix", "/tmp/final.md", "prompt");

    expect(codexCommand()).toBe(process.env.CODEX_BIN || "codex");
    expect(args[0]).toBe("exec");
    expect(args).not.toContain("dlx");
    expect(args).not.toContain("@openai/codex@latest");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("mcp_servers.clankeroverflow.enabled=true");
    expect(args).not.toContain("mcp_servers.context7.enabled=false");
    expect(args).toContain('mcp_servers.clankeroverflow.command="pnpm"');
    expect(args).toContain(
      `mcp_servers.clankeroverflow.args=${JSON.stringify([
        "--dir",
        resolve(testDir, "../../../.."),
        "exec",
        "tsx",
        "packages/cli/src/index.ts",
        "mcp",
      ])}`,
    );
    expect(args).not.toContain("mcp_servers.clankeroverflow.enabled=false");
  });

  test("disables ClankerOverflow for the without_mcp config", () => {
    const args = codexArgs(options, "without_mcp", "/tmp/final.md", "prompt");

    const settings = args.filter((arg) => arg.startsWith("mcp_servers.clankeroverflow.enabled="));
    expect(settings).toEqual([
      "mcp_servers.clankeroverflow.enabled=true",
      "mcp_servers.clankeroverflow.enabled=false",
    ]);
    expect(args.lastIndexOf(settings[1]!)).toBeGreaterThan(args.lastIndexOf(settings[0]!));
    expect(args.at(-1)).toBe("prompt");
  });

  test("isolates Codex skills for MCP and no-MCP configs", () => {
    const withMcp = createCodexEnvironment("with_mcp_known_fix", "with-mcp-test");
    const withoutMcp = createCodexEnvironment("without_mcp", "without-mcp-test");
    try {
      expect(existsSync(join(withMcp.codexHome, "skills", "clankeroverflow-mcp", "SKILL.md"))).toBe(
        true,
      );
      expect(
        existsSync(join(withoutMcp.codexHome, "skills", "clankeroverflow-mcp", "SKILL.md")),
      ).toBe(false);
    } finally {
      rmSync(withMcp.root, { recursive: true, force: true });
      rmSync(withoutMcp.root, { recursive: true, force: true });
    }
  });

  test("parses usage and logged local solution IDs from Codex JSON events", () => {
    const dir = mkdtempSync(join(tmpdir(), "clanker-recorder-test-"));
    const eventsPath = join(dir, "events.jsonl");
    try {
      writeFileSync(
        eventsPath,
        [
          JSON.stringify({
            type: "item.completed",
            item: {
              type: "mcp_tool_call",
              tool: "log_solution",
              arguments: { problem: "p", solution: "s" },
              result: {
                content: [{ type: "text", text: "Success! Solution logged locally: abc" }],
              },
            },
          }),
          JSON.stringify({
            type: "turn.completed",
            usage: {
              input_tokens: 10,
              cached_input_tokens: 3,
              output_tokens: 4,
              reasoning_output_tokens: 2,
            },
          }),
        ].join("\n"),
      );

      expect(parseToolCalls(eventsPath)[0]?.logged_ids).toEqual(["abc"]);
      expect(parseUsage(eventsPath, 123)).toEqual({
        input_tokens: 10,
        cached_input_tokens: 3,
        output_tokens: 4,
        reasoning_output_tokens: 2,
        total_provider_tokens: 16,
        elapsed_ms: 123,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("detects Codex usage-limit failures for resumable runs", () => {
    expect(
      isUsageLimitRun({
        scenario_id: "s",
        config: "with_mcp_known_fix",
        repetition: 1,
        status: "failed",
        error: "You've hit your usage limit. Visit settings or try again at Jul 6th, 2026 2:03 AM.",
        transcript: "",
        tool_calls: [],
        returned_solution_ids: [],
        logged_solution_ids: [],
        final_answer: "Codex exec failed with status 1.",
      }),
    ).toBe(true);
    expect(
      isUsageLimitRun({
        scenario_id: "s",
        config: "without_mcp",
        repetition: 1,
        status: "failed",
        error: "Command timed out",
        transcript: "",
        tool_calls: [],
        returned_solution_ids: [],
        logged_solution_ids: [],
        final_answer: "Codex exec failed with status 1.",
      }),
    ).toBe(false);
  });
});
