import { cp, mkdir, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Env = Partial<NodeJS.ProcessEnv>;

type InstallBundledSkillOptions = {
  env?: Env;
  packageRoot?: string;
};

export function resolveGlobalSkillsDirs(env: Env = process.env) {
  const dirs: string[] = [];

  if (env.XDG_CONFIG_HOME) {
    dirs.push(path.join(env.XDG_CONFIG_HOME, "opencode", "skills"));
  } else if (env.HOME) {
    dirs.push(path.join(env.HOME, ".config", "opencode", "skills"));
  }

  if (env.HOME) {
    dirs.push(path.join(env.HOME, ".agents", "skills"));
  }

  const extraDirs = env.CLANKER_SKILLS_DIRS?.split(",")
    .map((dir) => dir.trim())
    .filter(Boolean);

  if (extraDirs?.length) {
    dirs.push(...extraDirs);
  }

  const uniqueDirs = [...new Set(dirs)];

  if (uniqueDirs.length === 0) {
    throw new Error("Could not resolve any global skills directory.");
  }

  return uniqueDirs;
}

async function maybeLinkClaudeSkill(sourceDir: string, env: Env) {
  if (!env.HOME) {
    return null;
  }

  const claudeSkillsDir = path.join(env.HOME, ".claude", "skills");

  try {
    const claudeStats = await stat(claudeSkillsDir);
    if (!claudeStats.isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  const destinationDir = path.join(claudeSkillsDir, "clankeroverflow-mcp");
  await rm(destinationDir, { force: true, recursive: true });
  await symlink(sourceDir, destinationDir, "dir");

  return destinationDir;
}

export async function installBundledSkill({
  env = process.env,
  packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
}: InstallBundledSkillOptions = {}) {
  const sourceDir = path.join(packageRoot, "skills", "clankeroverflow-mcp");
  const destinationDirs = resolveGlobalSkillsDirs(env).map((skillsDir) =>
    path.join(skillsDir, "clankeroverflow-mcp"),
  );

  for (const destinationDir of destinationDirs) {
    await mkdir(path.dirname(destinationDir), { recursive: true });
    await cp(sourceDir, destinationDir, { force: true, recursive: true });
  }

  const claudeDestinationDir = await maybeLinkClaudeSkill(sourceDir, env);
  if (claudeDestinationDir) {
    destinationDirs.push(claudeDestinationDir);
  }

  return destinationDirs;
}

export async function runPostinstall() {
  try {
    const installedPaths = await installBundledSkill();
    console.info(`Installed ClankerOverflow skill to ${installedPaths.join(", ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Could not install ClankerOverflow skill: ${message}`);
  }
}

if (import.meta.main) {
  await runPostinstall();
}
