import { describe, it, expect } from "vitest";
import {
  generateCursorHooks,
  generateClaudeHooks,
  markOwn,
  removeOwn,
  mergeCursorHooks,
} from "./install.js";

const opts = {
  postToolUseScript: "/x/post-tool-use.mjs",
  sessionStartScript: "/x/session-start.mjs",
};

describe("markOwn / removeOwn", () => {
  it("marks Cursor hook entries even though they have no `type` field", () => {
    // Cursor entries are { command, matcher } — no `type`. Regression guard:
    // previously markOwn required `type` and skipped these, so re-installs
    // produced duplicates.
    const cursor = generateCursorHooks(opts);
    const marked = markOwn(cursor);

    const postToolUse = (marked.hooks as Record<string, any[]>).postToolUse;
    expect(postToolUse).toHaveLength(1);
    expect(postToolUse[0]).toHaveProperty("_clankeroverflow", true);
    expect(postToolUse[0]).toHaveProperty("command");
    expect(postToolUse[0]).not.toHaveProperty("type");
  });

  it("marks Claude/ZCode hook entries (which carry `type: command`)", () => {
    const claude = generateClaudeHooks(opts);
    const marked = markOwn(claude);

    const postToolUse = (marked.hooks as Record<string, any[]>).PostToolUse;
    const inner = postToolUse[0].hooks[0];
    expect(inner).toHaveProperty("_clankeroverflow", true);
    expect(inner).toHaveProperty("type", "command");
  });

  it("removeOwn strips our entries but preserves user entries", () => {
    const own = markOwn(generateCursorHooks(opts));
    // A foreign hook the user added themselves.
    const userEntry = { command: "echo hello", matcher: "Bash" };

    const withUser = {
      version: 1,
      hooks: {
        postToolUse: [...(own.hooks as Record<string, any[]>).postToolUse, userEntry],
      },
    };

    const cleaned = removeOwn(withUser);
    const remaining = (cleaned.hooks as Record<string, any[]>).postToolUse;
    expect(remaining).toEqual([userEntry]);
  });

  it("re-merging own hooks into an already-marked config does not duplicate (Cursor)", () => {
    // Mirror the real installHooks flow: own = markOwn(generate(...)), then
    // merge into the (marked) on-disk config and write back. Markers persist
    // on disk, so a second install reads them and removeOwn prunes our entries
    // before re-appending — no duplicates.
    const own = markOwn(generateCursorHooks(opts));

    // First install into an empty config.
    const first = mergeCursorHooks({}, own);
    // Second install on top of the first (which carries our markers).
    const second = mergeCursorHooks(first, own);

    const hooks = second.hooks as Record<string, any[]>;
    expect(hooks.postToolUse).toHaveLength(1);
    expect(hooks.beforeSubmitPrompt).toHaveLength(1);
  });
});
