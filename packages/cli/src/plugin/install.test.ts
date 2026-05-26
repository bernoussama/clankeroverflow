import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  installPlugin,
  uninstallPlugin,
  isPluginInstalled,
  resolvePackageRoot,
} from "./install.js";

let testRoot: string;
let fakeHome: string;

beforeAll(async () => {
  testRoot = await mkdtemp(path.join(tmpdir(), "clanker-plugin-test-"));
  fakeHome = path.join(testRoot, "home");
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

async function createPackageRoot() {
  const pkgRoot = path.join(testRoot, "pkg");
  const dirs = [".claude-plugin", "commands", "hooks", "skills"];
  for (const dir of dirs) {
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(path.join(pkgRoot, dir), { recursive: true }),
    );
  }

  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      path.join(pkgRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: {} }),
      "utf-8",
    ),
  );

  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      path.join(pkgRoot, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "test-plugin" }),
      "utf-8",
    ),
  );

  await import("node:fs/promises").then((fs) =>
    fs.mkdir(path.join(pkgRoot, "skills", "clankeroverflow-mcp"), {
      recursive: true,
    }),
  );
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      path.join(pkgRoot, "skills", "clankeroverflow-mcp", "SKILL.md"),
      "# Test Skill",
      "utf-8",
    ),
  );

  return pkgRoot;
}

describe("installPlugin", () => {
  it("resolves the package root from the source module location", async () => {
    const packageRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );

    await expect(resolvePackageRoot()).resolves.toBe(packageRoot);
  });

  it("creates the expected directory structure", async () => {
    const pkgRoot = await createPackageRoot();
    const installDir = await installPlugin({
      packageRoot: pkgRoot,
      envHome: fakeHome,
    });

    expect(installDir).toBe(
      path.join(fakeHome, ".claude", "plugins", "clankeroverflow"),
    );

    await expect(
      readFile(path.join(installDir, "skills", "clankeroverflow-mcp", "SKILL.md"), "utf-8"),
    ).resolves.toBeTruthy();
  });

  it("creates settings file when it doesn't exist", async () => {
    const pkgRoot = await createPackageRoot();
    const settingsPath = path.join(fakeHome, ".claude", "clankeroverflow.local.md");

    await rm(path.dirname(settingsPath), { recursive: true, force: true });
    await rm(path.join(fakeHome, ".claude", "plugins"), {
      recursive: true,
      force: true,
    });
    await installPlugin({ packageRoot: pkgRoot, envHome: fakeHome });

    const content = await readFile(settingsPath, "utf-8");
    expect(content).toContain("default_search_mode: hybrid");
    expect(content).toContain("auto_search_on_error: true");
    expect(content).toContain("server_url: https://api.clankeroverflow.com");
  });

  it("does not overwrite existing settings file", async () => {
    const pkgRoot = await createPackageRoot();
    const settingsDir = path.join(fakeHome, ".claude");
    const settingsPath = path.join(settingsDir, "clankeroverflow.local.md");

    await import("node:fs/promises").then((fs) =>
      fs.mkdir(settingsDir, { recursive: true }),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(settingsPath, "---\ncustom: true\n---\n\nCustom content", "utf-8"),
    );

    await rm(path.join(fakeHome, ".claude", "plugins"), {
      recursive: true,
      force: true,
    });
    await installPlugin({ packageRoot: pkgRoot, envHome: fakeHome });

    const content = await readFile(settingsPath, "utf-8");
    expect(content).toBe("---\ncustom: true\n---\n\nCustom content");
  });
});

describe("uninstallPlugin", () => {
  it("removes the plugin directory", async () => {
    const pkgRoot = await createPackageRoot();
    const installDir = path.join(fakeHome, ".claude", "plugins", "clankeroverflow");

    await installPlugin({ packageRoot: pkgRoot, envHome: fakeHome });
    await uninstallPlugin(fakeHome);

    await expect(
      import("node:fs/promises").then((fs) => fs.readdir(installDir)),
    ).rejects.toThrow();
  });

  it("no-ops when not installed", async () => {
    const installDir = path.join(fakeHome, ".claude", "plugins", "clankeroverflow");
    await rm(fakeHome, { recursive: true, force: true });

    await uninstallPlugin(fakeHome);
    await expect(
      import("node:fs/promises").then((fs) => fs.access(installDir)),
    ).rejects.toThrow();
  });
});

describe("isPluginInstalled", () => {
  it("returns true when plugin.json exists", async () => {
    const pkgRoot = await createPackageRoot();
    await installPlugin({ packageRoot: pkgRoot, envHome: fakeHome });
    expect(await isPluginInstalled(fakeHome)).toBe(true);
  });

  it("returns false when not installed", async () => {
    await rm(path.join(fakeHome, ".claude", "plugins"), {
      recursive: true,
      force: true,
    });
    expect(await isPluginInstalled(fakeHome)).toBe(false);
  });
});
