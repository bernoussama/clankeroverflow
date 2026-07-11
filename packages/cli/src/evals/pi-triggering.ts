import { readFileSync } from "node:fs";

export type PiPolicyLabel =
  | "must_search_failure"
  | "must_search_behavior"
  | "must_search_implementation"
  | "must_not_search";

export type PiSearchPolicyLabel = Exclude<PiPolicyLabel, "must_not_search">;

export type PiTriggerCase = {
  id: string;
  policy_label: PiPolicyLabel;
  prompt: string;
  events?: unknown[];
};

export type PiTurnAudit = {
  prompt: string;
  reminded: boolean;
  searched: boolean;
  searchQuery: string | null;
  searchBeforeDebug: boolean | null;
  skillReads: number;
  reminderCount: number;
  learnCount: number;
};

export type PiCaseGrade = PiTurnAudit & {
  id: string;
  policyLabel: PiPolicyLabel;
  expectedReminder: boolean;
  triggerPass: boolean;
  behaviorPass: boolean;
};

export type RatioMetric = {
  passed: number;
  total: number;
  rate: number | null;
};

export type PiTriggerSummary = {
  caseCount: number;
  positiveCount: number;
  negativeCount: number;
  triggerRecall: RatioMetric;
  recallByCategory: Record<PiSearchPolicyLabel, RatioMetric>;
  metricsByCategory: Record<
    PiSearchPolicyLabel,
    {
      triggerRecall: RatioMetric;
      searchCompliance: RatioMetric;
      searchBeforeDebug: RatioMetric;
    }
  >;
  triggerPrecision: RatioMetric;
  skipPrecision: RatioMetric;
  searchCompliance: RatioMetric;
  searchBeforeDebug: RatioMetric;
  negativeSearchAvoidance: RatioMetric;
  reminderToSearchConversion: RatioMetric;
  redundantReminderTurns: number;
  totalSkillReads: number;
  verifiedLearnRate: RatioMetric;
};

type Action =
  | { kind: "reminder" }
  | { kind: "search"; query: string | null }
  | { kind: "learn" }
  | { kind: "skill_read" }
  | { kind: "debug" };

const FAILURE_PROMPT =
  /\b(error|fails?|failed|failing|failure|stack trace|traceback|panic|crashes?|regression|does(?:n't| not) work|not working|refuses? to|still uses?|404|timeout|times? out|timed out|missing|invalid uuid|cannot find module|module not found|broken pipe|econnreset|unable_to_verify_leaf_signature)\b/i;
const NAMED_TECHNICAL_FINGERPRINT =
  /\b(auth|better auth|oauth|stripe|webhook|ssr|seo|fuse|udev|systemd|cloudflare(?: workers)?|neon|prisma|vite|astro|bubble tea|bubbles|hyprland|wayland|next(?:\.js)?|alloweddevorigins|trustedorigins|nvidia-persistenced|prime(?: render)? offload|d3cold|node(?:\.js)?|pnpm|docker|inertia)\b/i;
const IMPLEMENTATION_INTENT =
  /\b(configure|implement|integrate|deploy|migrate|set up|setup|add|build|wire|enable)\b/i;
const BEHAVIOR_INTENT =
  /\b(does|do|will|would|can|could|is|are|affect|support|require|retain|retry|cache|work|behavior|behaviour)\b/i;
const NEGATIVE_INTENT =
  /^\s*(compare|which should|write (a |the )?(readme|docs)|commit|stash|git blame|rename|fix (the )?typo|rewrite|create a branch)\b/i;
const BASIC_CONCEPT =
  /^\s*(what is|what's|whats|explain)\s+(a |an |the )?(cursor|refcell|rc|daemon|prime render offload)\b/i;

export function classifyPiPrompt(prompt: string): PiPolicyLabel {
  if (NEGATIVE_INTENT.test(prompt) || BASIC_CONCEPT.test(prompt)) return "must_not_search";
  if (FAILURE_PROMPT.test(prompt)) return "must_search_failure";
  if (NAMED_TECHNICAL_FINGERPRINT.test(prompt) && IMPLEMENTATION_INTENT.test(prompt)) {
    return "must_search_implementation";
  }
  if (NAMED_TECHNICAL_FINGERPRINT.test(prompt) && BEHAVIOR_INTENT.test(prompt)) {
    return "must_search_behavior";
  }
  return "must_not_search";
}

export function shouldTriggerPiReminder(prompt: string): boolean {
  return classifyPiPrompt(prompt) !== "must_not_search";
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.map(textContent).join("\n");
  return Object.values(value as Record<string, unknown>)
    .map(textContent)
    .join("\n");
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      const text = (block as Record<string, unknown>).text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n");
}

function toolCallFromContent(content: unknown): Array<{ name: string; arguments: unknown }> {
  if (!Array.isArray(content)) return [];
  return content.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const block = item as Record<string, unknown>;
    if (block.type !== "toolCall" || typeof block.name !== "string") return [];
    return [{ name: block.name, arguments: block.arguments }];
  });
}

function shellCommand(argumentsValue: unknown): string {
  if (!argumentsValue || typeof argumentsValue !== "object") return "";
  const args = argumentsValue as Record<string, unknown>;
  return typeof args.command === "string"
    ? args.command
    : typeof args.cmd === "string"
      ? args.cmd
      : "";
}

function quotedSearchQuery(command: string): string | null {
  const match = command.match(
    /(?:npx\s+(?:-y\s+)?@clankeroverflow\/cli(?:@\S+)?|clanker)\s+(?:local\s+)?search\s+(["'])(.*?)\1/i,
  );
  return match?.[2]?.trim() || null;
}

function actionsForEvent(event: unknown): Action[] {
  if (!event || typeof event !== "object") return [];
  const row = event as Record<string, unknown>;
  if (row.type === "custom_message" && row.customType === "clankeroverflow-reminder") {
    return [{ kind: "reminder" }];
  }
  if (row.type !== "message" || !row.message || typeof row.message !== "object") return [];
  const message = row.message as Record<string, unknown>;
  if (message.role !== "assistant") return [];

  return toolCallFromContent(message.content).flatMap((call): Action[] => {
    const name = call.name.toLowerCase();
    const argsText = textContent(call.arguments);
    const command = shellCommand(call.arguments);
    if (name.includes("search_solutions")) {
      let query: string | null = null;
      if (call.arguments && typeof call.arguments === "object") {
        const candidate = (call.arguments as Record<string, unknown>).query;
        if (typeof candidate === "string") query = candidate;
      }
      return [{ kind: "search", query }];
    }
    if (name.includes("learn_solution") || name.includes("log_solution")) {
      return [{ kind: "learn" }];
    }
    if (/\b(?:clanker\s+learn|clanker\s+log)\b/i.test(command)) return [{ kind: "learn" }];
    if (/(?:\bclanker|@clankeroverflow\/cli(?:@\S+)?)\s+(?:local\s+)?search\b/i.test(command)) {
      return [{ kind: "search", query: quotedSearchQuery(command) }];
    }
    if (
      (name === "read" || name.endsWith("read_file")) &&
      /clankeroverflow-(?:cli|mcp)[/\\]skill\.md/i.test(argsText)
    ) {
      return [{ kind: "skill_read" }];
    }
    return [{ kind: "debug" }];
  });
}

export function parsePiJsonl(source: string): unknown[] {
  return source
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(`Invalid Pi JSONL at line ${index + 1}`, { cause: error });
      }
    });
}

export function extractPiTurns(events: unknown[]): Array<{ prompt: string; events: unknown[] }> {
  const turns: Array<{ prompt: string; events: unknown[] }> = [];
  let current: { prompt: string; events: unknown[] } | null = null;
  for (const event of events) {
    if (event && typeof event === "object") {
      const row = event as Record<string, unknown>;
      if (row.type === "message" && row.message && typeof row.message === "object") {
        const message = row.message as Record<string, unknown>;
        if (message.role === "user") {
          if (current) turns.push(current);
          current = { prompt: messageText(message.content).trim(), events: [] };
          continue;
        }
      }
    }
    if (current) current.events.push(event);
  }
  if (current) turns.push(current);
  return turns;
}

export function auditPiTurn(prompt: string, events: unknown[]): PiTurnAudit {
  const actions = events.flatMap(actionsForEvent);
  const reminders = actions.filter((action) => action.kind === "reminder");
  const searches = actions.filter(
    (action): action is Extract<Action, { kind: "search" }> => action.kind === "search",
  );
  const firstSearch = actions.findIndex((action) => action.kind === "search");
  const firstDebug = actions.findIndex((action) => action.kind === "debug");
  return {
    prompt,
    reminded: reminders.length > 0,
    searched: searches.length > 0,
    searchQuery: searches[0]?.query ?? null,
    searchBeforeDebug: firstSearch < 0 ? null : firstDebug < 0 ? true : firstSearch < firstDebug,
    skillReads: actions.filter((action) => action.kind === "skill_read").length,
    reminderCount: reminders.length,
    learnCount: actions.filter((action) => action.kind === "learn").length,
  };
}

export function gradePiCase(testCase: PiTriggerCase): PiCaseGrade {
  const audit = auditPiTurn(testCase.prompt, testCase.events ?? []);
  const expectedReminder = testCase.policy_label !== "must_not_search";
  return {
    ...audit,
    id: testCase.id,
    policyLabel: testCase.policy_label,
    expectedReminder,
    triggerPass: classifyPiPrompt(testCase.prompt) === testCase.policy_label,
    behaviorPass: expectedReminder
      ? audit.searched && audit.searchBeforeDebug === true
      : !audit.searched,
  };
}

function ratio(passed: number, total: number): RatioMetric {
  return { passed, total, rate: total === 0 ? null : passed / total };
}

export function summarizePiTriggerCases(cases: PiTriggerCase[]): PiTriggerSummary {
  const grades = cases.map(gradePiCase);
  const positives = grades.filter((grade) => grade.expectedReminder);
  const negatives = grades.filter((grade) => !grade.expectedReminder);
  const predicted = grades.filter((grade) => shouldTriggerPiReminder(grade.prompt));
  const predictedSkips = grades.filter((grade) => !shouldTriggerPiReminder(grade.prompt));
  const reminded = grades.filter((grade) => grade.reminded);
  const verified = grades.filter((grade) => grade.searchBeforeDebug === true);
  const recallFor = (label: PiSearchPolicyLabel) => {
    const category = grades.filter((grade) => grade.policyLabel === label);
    return ratio(
      category.filter((grade) => classifyPiPrompt(grade.prompt) === label).length,
      category.length,
    );
  };
  const metricsFor = (label: PiSearchPolicyLabel) => {
    const category = grades.filter((grade) => grade.policyLabel === label);
    return {
      triggerRecall: recallFor(label),
      searchCompliance: ratio(category.filter((grade) => grade.searched).length, category.length),
      searchBeforeDebug: ratio(
        category.filter((grade) => grade.searchBeforeDebug === true).length,
        category.length,
      ),
    };
  };
  return {
    caseCount: grades.length,
    positiveCount: positives.length,
    negativeCount: negatives.length,
    triggerRecall: ratio(
      positives.filter((grade) => shouldTriggerPiReminder(grade.prompt)).length,
      positives.length,
    ),
    recallByCategory: {
      must_search_failure: recallFor("must_search_failure"),
      must_search_behavior: recallFor("must_search_behavior"),
      must_search_implementation: recallFor("must_search_implementation"),
    },
    metricsByCategory: {
      must_search_failure: metricsFor("must_search_failure"),
      must_search_behavior: metricsFor("must_search_behavior"),
      must_search_implementation: metricsFor("must_search_implementation"),
    },
    triggerPrecision: ratio(
      predicted.filter((grade) => grade.expectedReminder).length,
      predicted.length,
    ),
    skipPrecision: ratio(
      predictedSkips.filter((grade) => !grade.expectedReminder).length,
      predictedSkips.length,
    ),
    searchCompliance: ratio(positives.filter((grade) => grade.searched).length, positives.length),
    searchBeforeDebug: ratio(
      positives.filter((grade) => grade.searchBeforeDebug === true).length,
      positives.length,
    ),
    negativeSearchAvoidance: ratio(
      negatives.filter((grade) => !grade.searched).length,
      negatives.length,
    ),
    reminderToSearchConversion: ratio(
      reminded.filter((grade) => grade.searched).length,
      reminded.length,
    ),
    redundantReminderTurns: grades.filter((grade) => grade.reminderCount > 1).length,
    totalSkillReads: grades.reduce((sum, grade) => sum + grade.skillReads, 0),
    verifiedLearnRate: ratio(
      verified.filter((grade) => grade.learnCount > 0).length,
      verified.length,
    ),
  };
}

export function loadPiTriggerCases(path: string): PiTriggerCase[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { cases?: PiTriggerCase[] };
  if (!Array.isArray(parsed.cases))
    throw new Error("Pi trigger fixture must contain a cases array");
  return parsed.cases;
}
