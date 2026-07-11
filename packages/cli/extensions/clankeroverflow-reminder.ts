/**
 * Conditional ClankerOverflow reminder for Pi.
 *
 * Pi loads TypeScript extensions from ~/.pi/agent/extensions.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SEARCH_COMMAND =
  'npx -y @clankeroverflow/cli search "<smallest distinctive fingerprint>" --limit 3';

const SKIP_PATTERNS = [
  /^\s*(?:what is|what are|define)\b/i,
  /^\s*explain\b.*\b(?:concept|conceptually|in general)\b/i,
  /\b(?:do you prefer|which .* (?:do you prefer|should i choose)|pros and cons|tradeoffs?)\b/i,
  /\b(?:fix (?:a )?typo|rename\b|reformat\b|formatting\b|rewrite (?:this )?(?:text|prose)|documentation only)\b/i,
  /\b(?:prose|copy editing)\b/i,
  /\b(?:git (?:status|commit|stash|blame|log)|commit (?:these|the) changes)\b/i,
  /\b(?:private|proprietary|internal) business (?:rule|logic)\b/i,
  /\b(?:do not|don't) (?:search|use (?:external|shared) memory|use clankeroverflow)\b/i,
];

const ACTION_PATTERN =
  /\b(?:can|could|does|do|will|would|should|affects?|requires?|supports?|allows?|works?|behaves?|configure|configuration|config|implement|integrat(?:e|ion)|migrat(?:e|ion)|deploy|authenticate|cache|render|verify|debug|fix|fail(?:s|ed|ing|ure)?|error|exception|panic|regression|timeout|crash(?:es|ed)?|not working)\b/i;

const TECHNICAL_FINGERPRINT = [
  /`[^`\n]{2,80}`/,
  /\b[A-Z][A-Z0-9_]{1,}\b/,
  /\b[A-Za-z]+[A-Z][A-Za-z0-9]*\b/,
  /\b[A-Z][a-z]{2,}(?:\.js)?\b/,
  /\b[A-Za-z0-9]+(?:[-_.:/][A-Za-z0-9@]+)+\b/,
  /\b(?:api|sdk|cli|daemon|driver|runtime|framework|library|package|plugin|middleware|webhook|database|browser|server|worker|provider)\s+[A-Za-z0-9@._/-]+\b/i,
];

const FAILURE_FINGERPRINT =
  /\b(?:[A-Z][A-Z0-9_]{2,}|exit (?:code|status) \d+|status \d{3}|signal \d+|traceback|stack trace|cannot find|not found|permission denied|connection refused|timed? out)\b/i;

export function shouldRemindForPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text || SKIP_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (FAILURE_FINGERPRINT.test(text)) return true;
  const fingerprintText = text.replace(
    /^\s*(?:can|could|does|do|will|would|should|how|why|when|is|are)\b\s*/i,
    "",
  );
  return (
    ACTION_PATTERN.test(text) &&
    TECHNICAL_FINGERPRINT.some((pattern) => pattern.test(fingerprintText))
  );
}

function textContent(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function reminder(reason: string): string {
  return `ClankerOverflow search required: ${reason} Search before answering, debugging, inspecting source/config, editing, or rerunning the command. A question does not need to be an error or bug: any reusable named technical fingerprint qualifies, and confidence or local inspection does not waive the search. Run: ${SEARCH_COMMAND}. Skip only basic concepts, preferences, trivial/prose/git work, private business logic, or an explicit user prohibition.`;
}

export default function (pi: ExtensionAPI) {
  let remindedThisTurn = false;

  pi.on("before_agent_start", async (event) => {
    remindedThisTurn = shouldRemindForPrompt(event.prompt);
    if (!remindedThisTurn) return;
    return {
      message: {
        customType: "clankeroverflow-reminder",
        content: reminder("the request contains a reusable named technical fingerprint."),
        display: false,
      },
    };
  });

  pi.on("tool_result", async (event) => {
    if (remindedThisTurn || !event.isError) return;
    const output = textContent(event.content);
    if (!FAILURE_FINGERPRINT.test(output) && output.trim().length < 12) return;
    remindedThisTurn = true;
    return {
      content: [
        ...event.content,
        {
          type: "text",
          text: reminder("this tool result introduced a concrete failure fingerprint."),
        },
      ],
    };
  });
}
