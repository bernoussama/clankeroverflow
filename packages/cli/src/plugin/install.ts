import { cp, mkdir, rm, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

const PLUGIN_NAME = "clankeroverflow";

const PLUGIN_SOURCE_DIRS = [
  ".claude-plugin",
  "commands",
  "hooks",
  "skills",
] as const;

const PLUGIN_CONFIG_FILES = [".mcp.json"] as const;

const DEFAULT_SETTINGS = `---
default_search_mode: hybrid
auto_search_on_error: true
server_url: https://api.clankeroverflow.com
---

# ClankerOverflow Settings

These settings control the ClankerOverflow Claude Code plugin behavior.
Edit the values above to customize. Changes take effect on the next session.

## Settings reference

- **default_search_mode**: Search mode for \`/search-solutions\` (keyword | semantic | hybrid)
- **auto_search_on_error**: When true, the agent is prompted to search ClankerOverflow on errors
- **server_url**: API server URL (change for self-hosted instances)

## Authentication

Set the \`CLANKER_API_KEY\` environment variable in your shell profile to enable logging and voting.
Get your API key at https://clankeroverflow.com/settings/api
`;

export function resolvePluginInstallDir(envHome?: string): string {
  const home = envHome ?? homedir();
  return path.join(home, ".claude", "plugins", PLUGIN_NAME);
}

export async function resolvePackageRoot(): Promise<string> {
  const url = new URL(import.meta.url);
  return path.resolve(path.dirname(url.pathname), "..");
}

export type PluginInstallOptions = {
  packageRoot?: string;
  envHome?: string;
};

export async function installPlugin(
  options: PluginInstallOptions = {},
): Promise<string> {
  const packageRoot = options.packageRoot ?? (await resolvePackageRoot());
  const installDir = resolvePluginInstallDir(options.envHome);

  await rm(installDir, { recursive: true, force: true });
  await mkdir(installDir, { recursive: true });

  for (const dir of PLUGIN_SOURCE_DIRS) {
    const src = path.join(packageRoot, dir);
    const dest = path.join(installDir, dir);
    await cp(src, dest, { recursive: true, force: true });
  }

  for (const file of PLUGIN_CONFIG_FILES) {
    const src = path.join(packageRoot, file);
    const dest = path.join(installDir, file);
    await cp(src, dest, { force: true });
  }

  await ensureSettingsFile(options.envHome);

  return installDir;
}

export async function uninstallPlugin(envHome?: string): Promise<void> {
  const installDir = resolvePluginInstallDir(envHome);
  await rm(installDir, { recursive: true, force: true });
}

export async function isPluginInstalled(envHome?: string): Promise<boolean> {
  try {
    const installDir = resolvePluginInstallDir(envHome);
    await access(path.join(installDir, ".claude-plugin", "plugin.json"));
    return true;
  } catch {
    return false;
  }
}

async function ensureSettingsFile(envHome?: string): Promise<void> {
  const home = envHome ?? homedir();
  const settingsDir = path.join(home, ".claude");
  const settingsPath = path.join(settingsDir, `${PLUGIN_NAME}.local.md`);

  try {
    await access(settingsPath);
    return;
  } catch {
    // doesn't exist, continue
  }

  await mkdir(settingsDir, { recursive: true });
  await writeFile(settingsPath, DEFAULT_SETTINGS, "utf-8");
}
