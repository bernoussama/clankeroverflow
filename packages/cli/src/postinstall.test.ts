import { lstat, mkdtemp, mkdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { installBundledSkill, resolveGlobalSkillsDirs } from "./postinstall";

describe("CLI postinstall", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "clanker-cli-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("includes common global skills directories for supported agents", () => {
    expect(
      resolveGlobalSkillsDirs({
        HOME: "/tmp/home",
        XDG_CONFIG_HOME: "/tmp/xdg-config",
        NODE_ENV: "test",
      }),
    ).toEqual([
      path.join("/tmp/xdg-config", "opencode", "skills"),
      path.join("/tmp/home", ".agents", "skills"),
    ]);
  });

  test("adds explicit extra skill directories from CLANKER_SKILLS_DIRS", () => {
    expect(
      resolveGlobalSkillsDirs({
        HOME: "/tmp/home",
        CLANKER_SKILLS_DIRS: "/tmp/agent-a/skills, /tmp/agent-b/skills",
        NODE_ENV: "test",
      }),
    ).toEqual([
      path.join("/tmp/home", ".config", "opencode", "skills"),
      path.join("/tmp/home", ".agents", "skills"),
      "/tmp/agent-a/skills",
      "/tmp/agent-b/skills",
    ]);
  });

  test("copies the bundled skill into every configured global skills directory", async () => {
    const packageRoot = path.join(tempDir, "package");
    const sourceDir = path.join(packageRoot, "skills", "clankeroverflow-mcp");
    const xdgConfigHome = path.join(tempDir, "xdg-config");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: clankeroverflow-mcp\n---\n\nUse this first.\n",
    );

    const installedPaths = await installBundledSkill({
      env: { HOME: tempDir, XDG_CONFIG_HOME: xdgConfigHome },
      packageRoot,
    });

    const opencodeSkill = await readFile(
      path.join(xdgConfigHome, "opencode", "skills", "clankeroverflow-mcp", "SKILL.md"),
      "utf8",
    );
    const agentsSkill = await readFile(
      path.join(tempDir, ".agents", "skills", "clankeroverflow-mcp", "SKILL.md"),
      "utf8",
    );

    expect(installedPaths).toEqual([
      path.join(xdgConfigHome, "opencode", "skills", "clankeroverflow-mcp"),
      path.join(tempDir, ".agents", "skills", "clankeroverflow-mcp"),
    ]);
    expect(opencodeSkill).toContain("name: clankeroverflow-mcp");
    expect(opencodeSkill).toContain("Use this first.");
    expect(agentsSkill).toContain("name: clankeroverflow-mcp");
    expect(agentsSkill).toContain("Use this first.");
  });

  test("copies the bundled skill into extra directories from CLANKER_SKILLS_DIRS", async () => {
    const packageRoot = path.join(tempDir, "package");
    const sourceDir = path.join(packageRoot, "skills", "clankeroverflow-mcp");
    const customSkillsDir = path.join(tempDir, "custom-agent", "skills");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: clankeroverflow-mcp\n---\n\nUse this first.\n",
    );

    const installedPaths = await installBundledSkill({
      env: {
        HOME: tempDir,
        CLANKER_SKILLS_DIRS: customSkillsDir,
        NODE_ENV: "test",
      },
      packageRoot,
    });

    const customSkill = await readFile(
      path.join(customSkillsDir, "clankeroverflow-mcp", "SKILL.md"),
      "utf8",
    );

    expect(installedPaths).toContain(path.join(customSkillsDir, "clankeroverflow-mcp"));
    expect(customSkill).toContain("name: clankeroverflow-mcp");
  });

  test("symlinks the bundled skill into ~/.claude/skills when that directory exists", async () => {
    const packageRoot = path.join(tempDir, "package");
    const sourceDir = path.join(packageRoot, "skills", "clankeroverflow-mcp");
    const claudeSkillsDir = path.join(tempDir, ".claude", "skills");

    await mkdir(sourceDir, { recursive: true });
    await mkdir(claudeSkillsDir, { recursive: true });
    await writeFile(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: clankeroverflow-mcp\n---\n\nUse this first.\n",
    );

    const installedPaths = await installBundledSkill({
      env: { HOME: tempDir },
      packageRoot,
    });

    const claudeSkillDir = path.join(claudeSkillsDir, "clankeroverflow-mcp");
    const stats = await lstat(claudeSkillDir);

    expect(installedPaths).toContain(claudeSkillDir);
    expect(stats.isSymbolicLink()).toBe(true);
    expect(await readlink(claudeSkillDir)).toBe(sourceDir);
  });
});
