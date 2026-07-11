import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  auditPiTurn,
  classifyPiPrompt,
  extractPiTurns,
  gradePiCase,
  loadPiTriggerCases,
  parsePiJsonl,
  shouldTriggerPiReminder,
  summarizePiTriggerCases,
} from "./pi-triggering";

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../clankeroverflow-mcp-workspace/pi-triggering/cases.json",
);

const reminder = {
  type: "custom_message",
  customType: "clankeroverflow-reminder",
  content: "Search first",
};

function tool(name: string, args: Record<string, unknown>) {
  return {
    type: "message",
    message: { role: "assistant", content: [{ type: "toolCall", name, arguments: args }] },
  };
}

describe("Pi ClankerOverflow triggering eval", () => {
  test("loads a four-category 60-case sanitized fixture pack", () => {
    const cases = loadPiTriggerCases(fixturePath);
    expect(cases).toHaveLength(60);
    expect(cases.filter((item) => item.policy_label === "must_search_failure")).toHaveLength(20);
    expect(cases.filter((item) => item.policy_label === "must_search_behavior")).toHaveLength(10);
    expect(cases.filter((item) => item.policy_label === "must_search_implementation")).toHaveLength(
      10,
    );
    expect(cases.filter((item) => item.policy_label === "must_not_search")).toHaveLength(20);
  });

  test("classifies concrete failures and rejects negative intents", () => {
    expect(shouldTriggerPiReminder("Vite crashes with ECONNRESET")).toBe(true);
    expect(shouldTriggerPiReminder("Stripe webhook fails only on Cloudflare Workers")).toBe(true);
    expect(shouldTriggerPiReminder("what is Cursor in Rust?")).toBe(false);
    expect(shouldTriggerPiReminder("write a README with the above instructions")).toBe(false);
  });

  test("classifies named operational questions even when nothing is broken", () => {
    expect(
      classifyPiPrompt(
        "Will nvidia-run still work if I disable nvidia-persistenced for PRIME render offload?",
      ),
    ).toBe("must_search_behavior");
    expect(classifyPiPrompt("Does Better Auth trustedOrigins accept IP origins?")).toBe(
      "must_search_behavior",
    );
    expect(classifyPiPrompt("Explain PRIME render offload conceptually.")).toBe("must_not_search");
  });

  test("parses JSONL with actionable line errors", () => {
    expect(parsePiJsonl('{"type":"session"}\n{"type":"message"}')).toHaveLength(2);
    expect(() => parsePiJsonl('{"type":"session"}\n{bad}')).toThrow("line 2");
  });

  test("extracts user turns without leaking the following prompt into the prior turn", () => {
    const events = parsePiJsonl(
      [
        '{"type":"message","message":{"role":"user","content":[{"type":"text","text":"first"}]}}',
        '{"type":"custom_message","customType":"clankeroverflow-reminder"}',
        '{"type":"message","message":{"role":"assistant","content":[]}}',
        '{"type":"message","message":{"role":"user","content":[{"type":"text","text":"second"}]}}',
      ].join("\n"),
    );
    const turns = extractPiTurns(events);
    expect(turns.map((turn) => turn.prompt)).toEqual(["first", "second"]);
    expect(turns[0]?.events).toHaveLength(2);
    expect(turns[1]?.events).toHaveLength(0);
  });

  test("detects CLI search before fresh debugging without charging a skill read", () => {
    const audit = auditPiTurn("tests fail with TS2307", [
      reminder,
      tool("read", { path: "/home/me/.agents/skills/clankeroverflow-cli/SKILL.md" }),
      tool("bash", { command: 'npx -y @clankeroverflow/cli search "TS2307 pnpm" --limit 3' }),
      tool("bash", { command: "pnpm test" }),
    ]);
    expect(audit).toMatchObject({
      reminded: true,
      searched: true,
      searchQuery: "TS2307 pnpm",
      searchBeforeDebug: true,
      skillReads: 1,
    });
  });

  test("detects MCP search and a search that happens too late", () => {
    const early = auditPiTurn("P2002", [
      reminder,
      tool("mcp__clankeroverflow__search_solutions", { query: "P2002 prisma" }),
      tool("read", { path: "/repo/schema.prisma" }),
    ]);
    const late = auditPiTurn("P2002", [
      reminder,
      tool("read", { path: "/repo/schema.prisma" }),
      tool("bash", { command: 'clanker search "P2002"' }),
    ]);
    expect(early.searchBeforeDebug).toBe(true);
    expect(late.searchBeforeDebug).toBe(false);
  });

  test("grades expected policy separately from observed behavior", () => {
    const grade = gradePiCase({
      id: "missed",
      policy_label: "must_search_failure",
      prompt: "Build failed with ERR_MODULE_NOT_FOUND",
      events: [reminder, tool("bash", { command: "pnpm build" })],
    });
    expect(grade.triggerPass).toBe(true);
    expect(grade.behaviorPass).toBe(false);
  });

  test("summarizes conversion, ordering, redundancy, and learning", () => {
    const cases = [
      {
        id: "positive",
        policy_label: "must_search_failure" as const,
        prompt: "Build failed with TS2307",
        events: [
          reminder,
          reminder,
          tool("bash", { command: 'clanker search "TS2307"' }),
          tool("bash", { command: "pnpm test" }),
          tool("bash", { command: 'clanker learn --problem "TS2307"' }),
        ],
      },
      {
        id: "negative",
        policy_label: "must_not_search" as const,
        prompt: "what is Cursor in Rust?",
        events: [],
      },
    ];
    const summary = summarizePiTriggerCases(cases);
    expect(summary.triggerRecall.rate).toBe(1);
    expect(summary.triggerPrecision.rate).toBe(1);
    expect(summary.searchBeforeDebug.rate).toBe(1);
    expect(summary.metricsByCategory.must_search_failure.searchBeforeDebug.rate).toBe(1);
    expect(summary.negativeSearchAvoidance.rate).toBe(1);
    expect(summary.redundantReminderTurns).toBe(1);
    expect(summary.verifiedLearnRate.rate).toBe(1);
  });

  test("fixture classifier meets per-category recall and skip precision targets", () => {
    const summary = summarizePiTriggerCases(loadPiTriggerCases(fixturePath));
    expect(summary.triggerRecall.rate).toBeGreaterThanOrEqual(0.9);
    expect(summary.triggerPrecision.rate).toBeGreaterThanOrEqual(0.9);
    expect(summary.skipPrecision.rate).toBeGreaterThanOrEqual(0.9);
    for (const metric of Object.values(summary.recallByCategory)) {
      expect(metric.rate).toBeGreaterThanOrEqual(0.9);
    }
  });
});
