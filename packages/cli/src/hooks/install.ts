/**
 * Hook installation logic — generates harness-native hook configurations
 * and merges them into the appropriate config files.
 *
 * Supports four harness formats:
 *   - claude  (Claude Code): ~/.claude/settings.json  (hooks object keyed by event)
 *   - codex   (Codex CLI):    ~/.codex/config.toml     (TOML [[hooks.Event]] arrays)
 *   - cursor  (Cursor):       ~/.cursor/hooks.json     ({ version, hooks } with flat entries)
 *   - json    (raw):          prints the plugin hooks/hooks.json directly
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

export type HookInstallOptions = {
  postToolUseScript: string;
  sessionStartScript: string;
  dryRun?: boolean;
  home?: string;
};

export type HookInstallResult = {
  harness: string;
  status: "configured" | "skipped" | "failed";
  detail: string;
};

const COOLDOWN_NOTE = "Silent on success, debounced to avoid noise.";

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// ── Config generation per harness ────────────────────────────────────────────

/**
 * Generate a Claude/ZCode-native hooks config object.
 * Used by: Claude Code, ZCode (both consume the same schema).
 * Also the format stored in the plugin's hooks/hooks.json.
 */
export function generateClaudeHooks(opts: HookInstallOptions): Record<string, unknown> {
  return {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|clear|compact",
          hooks: [
            {
              type: "command",
              command: `node "${opts.sessionStartScript}"`,
              timeout: 5,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: `node "${opts.postToolUseScript}"`,
              timeout: 5,
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command: `node "${opts.postToolUseScript}"`,
              timeout: 5,
            },
          ],
        },
      ],
    },
  };
}

/**
 * Generate a Codex-native hooks config (TOML-style object, but returned as
 * a structured object that the installer writes as TOML).
 */
export function generateCodexHooks(opts: HookInstallOptions): Record<string, unknown> {
  return {
    PostToolUse: [
      {
        matcher: "Bash",
        command: `node "${opts.postToolUseScript}"`,
        timeout: 5,
      },
    ],
    UserPromptSubmit: [
      {
        command: `node "${opts.postToolUseScript}"`,
        timeout: 5,
      },
    ],
  };
}

/**
 * Generate a Cursor-native hooks config.
 * Cursor format: { version: 1, hooks: { postToolUse: [{command, matcher}], beforeSubmitPrompt: [{command}] } }
 */
export function generateCursorHooks(opts: HookInstallOptions): Record<string, unknown> {
  return {
    version: 1,
    hooks: {
      postToolUse: [
        {
          command: `node "${opts.postToolUseScript}"`,
          matcher: "Shell|Bash",
        },
      ],
      beforeSubmitPrompt: [
        {
          command: `node "${opts.postToolUseScript}"`,
        },
      ],
    },
  };
}

/**
 * Generate the raw plugin hooks.json (the format shipped in the npm package,
 * with ${CLAUDE_PLUGIN_ROOT} placeholder that the plugin system expands).
 */
export function generatePluginHooks(_opts: HookInstallOptions): Record<string, unknown> {
  return {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|clear|compact",
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"',
              timeout: 5,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.mjs"',
              timeout: 5,
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.mjs"',
              timeout: 5,
            },
          ],
        },
      ],
    },
  };
}

/**
 * Generate hook config for a given harness format.
 */
export function generateHookConfig(
  harness: string,
  opts: HookInstallOptions,
): Record<string, unknown> {
  switch (harness) {
    case "claude":
      return generateClaudeHooks(opts);
    case "codex":
      return generateCodexHooks(opts);
    case "cursor":
      return generateCursorHooks(opts);
    case "json":
      return generatePluginHooks(opts);
    default:
      throw new Error(`Unknown harness "${harness}". Use: claude, codex, cursor, or json.`);
  }
}

// ── Installation per harness ─────────────────────────────────────────────────

async function readJsonObject(filePath: string): Promise<Record<string, any>> {
  if (!(await pathExists(filePath))) return {};
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, any>;
  } catch {
    throw new Error(`Refusing to overwrite invalid JSON in ${filePath}`);
  }
}

async function writeJsonObject(
  filePath: string,
  value: Record<string, any>,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/**
 * Mark all leaf hook-command entries with `_clankeroverflow: true` so we can
 * identify and replace them on re-install without clobbering user hooks.
 * Only marks objects that contain a `command` field (the actual hook entries),
 * not the event-grouping objects or the top-level `hooks` wrapper.
 */
function markOwn(hooksConfig: Record<string, unknown>): Record<string, unknown> {
  const marked = JSON.parse(JSON.stringify(hooksConfig));
  function walk(obj: any) {
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
    } else if (obj && typeof obj === "object") {
      // Only mark leaf-level hook command objects.
      if ("command" in obj && "type" in obj) {
        obj._clankeroverflow = true;
      }
      for (const v of Object.values(obj)) walk(v);
    }
  }
  walk(marked.hooks ?? marked);
  return marked;
}

/**
 * Remove previously-installed clankeroverflow hook entries from a hooks object.
 *
 * Strategy: recursively walk the structure. Hook command objects (leaf-level
 * `{type, command}` objects) that have `_clankeroverflow: true` are removed
 * entirely (return null). Event entries (`{matcher, hooks: [...]}`) are removed
 * if all their hook commands were ours. The marker field is stripped from
 * any object that survives.
 */
function removeOwn(hooksObj: any): any {
  // Leaf-level hook command marked as ours → remove it.
  if (
    hooksObj &&
    typeof hooksObj === "object" &&
    !Array.isArray(hooksObj) &&
    hooksObj._clankeroverflow === true &&
    "command" in hooksObj
  ) {
    return null;
  }
  if (Array.isArray(hooksObj)) {
    return hooksObj.map((item) => removeOwn(item)).filter((item) => item !== null);
  }
  if (hooksObj && typeof hooksObj === "object") {
    // Strip the marker field; it's not needed in output.
    const { _clankeroverflow: _ignored, ...rest } = hooksObj;
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(rest)) {
      result[key] = removeOwn(value);
    }
    // If this is an event entry ({matcher, hooks: [...]}), remove it entirely
    // when all its hook commands were ours (the hooks array is now empty).
    if ("hooks" in result && Array.isArray(result.hooks) && result.hooks.length === 0) {
      return null;
    }
    return result;
  }
  return hooksObj;
}

/**
 * Merge our hooks into an existing Claude/ZCode settings.json hooks object.
 */
function mergeClaudeHooks(
  existing: Record<string, any>,
  own: Record<string, any>,
): Record<string, any> {
  const existingHooks = removeOwn(existing.hooks ?? {});
  const ownHooks = (own.hooks ?? {}) as Record<string, any[]>;
  const merged: Record<string, any[]> = { ...existingHooks };
  for (const [event, entries] of Object.entries(ownHooks)) {
    // Skip non-array values (e.g. marker fields like _clankeroverflow).
    if (!Array.isArray(entries)) continue;
    merged[event] = [...(merged[event] ?? []), ...entries];
  }
  return { ...existing, hooks: merged };
}

/**
 * Merge our hooks into a Cursor hooks.json.
 * Cursor format: { version: 1, hooks: { postToolUse: [...], beforeSubmitPrompt: [...] } }
 */
function mergeCursorHooks(
  existing: Record<string, any>,
  own: Record<string, any>,
): Record<string, any> {
  const existingHooks = removeOwn(existing.hooks ?? {});
  const ownHooks = (own.hooks ?? {}) as Record<string, any[]>;
  const merged: Record<string, any[]> = { ...existingHooks };
  for (const [event, entries] of Object.entries(ownHooks)) {
    if (!Array.isArray(entries)) continue;
    merged[event] = [...(merged[event] ?? []), ...entries];
  }
  return { version: 1, ...existing, hooks: merged };
}

/**
 * Generate TOML [[hooks.*]] entries for Codex config.toml.
 */
function generateCodexToml(opts: HookInstallOptions): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("# ClankerOverflow ambient hooks — nudge to search on failure signals.");
  lines.push(`# ${COOLDOWN_NOTE}`);
  lines.push("");
  lines.push("[[hooks.PostToolUse]]");
  lines.push('matcher = "Bash"');
  lines.push(`command = 'node "${opts.postToolUseScript}"'`);
  lines.push("timeout = 5");
  lines.push("");
  lines.push("[[hooks.UserPromptSubmit]]");
  lines.push(`command = 'node "${opts.postToolUseScript}"'`);
  lines.push("timeout = 5");
  lines.push("");
  return lines.join("\n");
}

/**
 * Install hooks for a given harness by merging into its config file.
 */
export async function installHooks(
  harness: string,
  opts: HookInstallOptions,
): Promise<HookInstallResult[]> {
  const home = opts.home ?? homedir();
  const dryRun = Boolean(opts.dryRun);
  const results: HookInstallResult[] = [];

  switch (harness) {
    case "claude": {
      const configPath = path.join(home, ".claude", "settings.json");
      const own = markOwn(generateClaudeHooks(opts));
      try {
        const existing = await readJsonObject(configPath);
        const merged = mergeClaudeHooks(existing, own);
        await writeJsonObject(configPath, merged, dryRun);
        results.push({
          harness: "claude",
          status: "configured",
          detail: `${dryRun ? "would merge" : "merged"} hooks into ${configPath}`,
        });
      } catch (error) {
        results.push({
          harness: "claude",
          status: "failed",
          detail: String((error as Error).message),
        });
      }
      // ZCode uses the same schema and is auto-detected by its plugin marketplace.
      // The hooks/hooks.json in the package handles ZCode plugin delivery.
      break;
    }
    case "codex": {
      const configPath = path.join(home, ".codex", "config.toml");
      try {
        let content = "";
        if (await pathExists(configPath)) {
          content = await readFile(configPath, "utf8");
        }
        // Remove any previous clankeroverflow hook block.
        content = content.replace(
          /\n# ClankerOverflow ambient hooks[\s\S]*?(?=\n\[|\n# ClankerOverflow|\n$|$)/g,
          "\n",
        );
        // Ensure [hooks] section exists.
        if (!content.includes("[hooks]")) {
          content += "\n[hooks]\n";
        }
        content += generateCodexToml(opts);
        if (!dryRun) {
          await mkdir(path.dirname(configPath), { recursive: true });
          await writeFile(configPath, content.trim() + "\n", "utf8");
        }
        results.push({
          harness: "codex",
          status: "configured",
          detail: `${dryRun ? "would merge" : "merged"} hooks into ${configPath}`,
        });
      } catch (error) {
        results.push({
          harness: "codex",
          status: "failed",
          detail: String((error as Error).message),
        });
      }
      break;
    }
    case "cursor": {
      const configPath = path.join(home, ".cursor", "hooks.json");
      const own = markOwn(generateCursorHooks(opts));
      try {
        const existing = await readJsonObject(configPath);
        const merged = mergeCursorHooks(existing, own);
        await writeJsonObject(configPath, merged, dryRun);
        results.push({
          harness: "cursor",
          status: "configured",
          detail: `${dryRun ? "would merge" : "merged"} hooks into ${configPath}`,
        });
      } catch (error) {
        results.push({
          harness: "cursor",
          status: "failed",
          detail: String((error as Error).message),
        });
      }
      break;
    }
    case "json":
      results.push({
        harness: "json",
        status: "skipped",
        detail: "Use 'claude', 'codex', or 'cursor' with --install to write to a config file",
      });
      break;
    default:
      results.push({
        harness,
        status: "failed",
        detail: `Unknown harness. Use: claude, codex, cursor, or json.`,
      });
  }

  return results;
}
