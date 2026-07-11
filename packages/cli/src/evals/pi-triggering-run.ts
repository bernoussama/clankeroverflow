import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { extname, resolve } from "node:path";

import {
  auditPiTurn,
  extractPiTurns,
  loadPiTriggerCases,
  parsePiJsonl,
  shouldTriggerPiReminder,
  summarizePiTriggerCases,
} from "./pi-triggering";

function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : extname(path) === ".jsonl" ? [path] : [];
  });
}

const repoRoot = resolve(import.meta.dirname, "../../../..");
const fixturePath = resolve(repoRoot, "clankeroverflow-mcp-workspace/pi-triggering/cases.json");
const sessionsRoot = resolve(process.argv[2] || `${homedir()}/.pi/agent/sessions`);
const cases = loadPiTriggerCases(fixturePath);
const fixtureSummary = summarizePiTriggerCases(cases);
const files = filesUnder(sessionsRoot);
const turns = files.flatMap((path) => {
  try {
    return extractPiTurns(parsePiJsonl(readFileSync(path, "utf8")));
  } catch (error) {
    process.stderr.write(`${path}: ${error instanceof Error ? error.message : String(error)}\n`);
    return [];
  }
});
const audited = turns.map((turn) => auditPiTurn(turn.prompt, turn.events));
const expectedPositive = audited.filter((turn) => shouldTriggerPiReminder(turn.prompt));
const observedReminders = audited.filter((turn) => turn.reminded);

const ratio = (passed: number, total: number) => ({
  passed,
  total,
  rate: total === 0 ? null : passed / total,
});

const output = {
  metadata: {
    sessions_root: sessionsRoot,
    session_files: files.length,
    turns: audited.length,
  },
  fixture_classifier: {
    case_count: fixtureSummary.caseCount,
    positive_count: fixtureSummary.positiveCount,
    negative_count: fixtureSummary.negativeCount,
    trigger_recall: fixtureSummary.triggerRecall,
    trigger_precision: fixtureSummary.triggerPrecision,
    skip_precision: fixtureSummary.skipPrecision,
    recall_by_category: fixtureSummary.recallByCategory,
    metrics_by_category: fixtureSummary.metricsByCategory,
  },
  observed_corpus: {
    expected_positive_turns: expectedPositive.length,
    reminder_turns: observedReminders.length,
    searched_turns: audited.filter((turn) => turn.searched).length,
    search_compliance: ratio(
      expectedPositive.filter((turn) => turn.searched).length,
      expectedPositive.length,
    ),
    search_before_debug: ratio(
      expectedPositive.filter((turn) => turn.searchBeforeDebug === true).length,
      expectedPositive.length,
    ),
    reminder_to_search_conversion: ratio(
      observedReminders.filter((turn) => turn.searched).length,
      observedReminders.length,
    ),
    redundant_reminder_turns: audited.filter((turn) => turn.reminderCount > 1).length,
    total_skill_reads: audited.reduce((sum, turn) => sum + turn.skillReads, 0),
    total_learns: audited.reduce((sum, turn) => sum + turn.learnCount, 0),
  },
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
