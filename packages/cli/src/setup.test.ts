import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { detectAgents, getCursorConfigPath, getOpenCodeConfigPath, setupAgents } from "./setup";

describe("smart setup", () => {
  let tempDir = "";
  let packageRoot = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "clanker-setup-"));
    packageRoot = path.join(tempDir, "package");
    for (const skill of ["clankeroverflow-mcp", "clankeroverflow-cli"]) {
      await mkdir(path.join(packageRoot, "skills", skill), { recursive: true });
      await writeFile(path.join(packageRoot, "skills", skill, "SKILL.md"), `# ${skill}\n`);
    }
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const noCommands = async () => false;
  const validFetch = vi.fn(async () => new Response(JSON.stringify([{ result: { data: true } }])));

  test("detects config directories and uses PATH-only detection for pi", async () => {
    await mkdir(path.join(tempDir, ".codex"));
    await mkdir(path.join(tempDir, ".cursor"));
    const detected = await detectAgents(tempDir, { PATH: "" }, async (command) => command === "pi");
    expect(detected).toEqual(["codex", "pi", "cursor"]);
  });

  test("writes one shared MCP skill and merges OpenCode and Cursor configs", async () => {
    const opencodePath = getOpenCodeConfigPath(tempDir, {});
    const cursorPath = getCursorConfigPath(tempDir);
    await mkdir(path.dirname(opencodePath), { recursive: true });
    await mkdir(path.dirname(cursorPath), { recursive: true });
    await writeFile(
      opencodePath,
      JSON.stringify({ theme: "dark", mcp: { existing: { enabled: true } } }),
    );
    await writeFile(cursorPath, JSON.stringify({ mcpServers: { existing: { command: "old" } } }));

    await setupAgents(
      {
        agents: ["opencode", "cursor"],
        apiKey: "clk_test",
        env: {},
        home: tempDir,
        packageRoot,
      },
      { fetch: validFetch as typeof fetch, commandExists: noCommands },
    );

    const opencode = JSON.parse(await readFile(opencodePath, "utf8"));
    const cursor = JSON.parse(await readFile(cursorPath, "utf8"));
    expect(opencode.theme).toBe("dark");
    expect(opencode.mcp.existing).toEqual({ enabled: true });
    expect(opencode.mcp.clankeroverflow.environment.CLANKER_API_KEY).toBe("clk_test");
    expect(opencode.mcp.clankeroverflow.command).toEqual([
      "npx",
      "-y",
      "@clankeroverflow/cli",
      "mcp",
    ]);
    expect(cursor.mcpServers.existing).toEqual({ command: "old" });
    expect(cursor.mcpServers.clankeroverflow.env.CLANKER_SERVER_URL).toBe(
      "https://api.clankeroverflow.com",
    );
    await expect(
      readFile(path.join(tempDir, ".agents", "skills", "clankeroverflow-mcp", "SKILL.md"), "utf8"),
    ).resolves.toContain("clankeroverflow-mcp");
  });

  test("installs only the CLI skill for a pi-only setup", async () => {
    await setupAgents(
      { agents: ["pi"], noApiKey: true, env: {}, home: tempDir, packageRoot },
      { commandExists: noCommands },
    );
    await expect(
      readFile(path.join(tempDir, ".agents", "skills", "clankeroverflow-cli", "SKILL.md"), "utf8"),
    ).resolves.toContain("clankeroverflow-cli");
    await expect(
      readFile(path.join(tempDir, ".agents", "skills", "clankeroverflow-mcp", "SKILL.md"), "utf8"),
    ).rejects.toThrow();
  });

  test("falls back to standalone Claude MCP only when the marketplace plugin is missing", async () => {
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      if (args.slice(0, 2).join(" ") === "plugin install") throw new Error("Plugin not found");
      return { stdout: "", stderr: "" };
    });
    await setupAgents(
      { agents: ["claude"], noApiKey: true, env: {}, home: tempDir, packageRoot },
      { runCommand, commandExists: noCommands },
    );
    expect(runCommand).toHaveBeenCalledWith("claude", [
      "mcp",
      "add",
      "--scope",
      "user",
      "clankeroverflow",
      "--env",
      "CLANKER_SERVER_URL=https://api.clankeroverflow.com",
      "--",
      "npx",
      "-y",
      "@clankeroverflow/cli",
      "mcp",
    ]);
  });

  test("validates supplied API keys through the API-key-aware endpoint", async () => {
    await setupAgents(
      { agents: ["cursor"], apiKey: "clk_test", env: {}, home: tempDir, packageRoot },
      { fetch: validFetch as typeof fetch, commandExists: noCommands },
    );

    expect(validFetch).toHaveBeenCalledWith(
      expect.stringContaining("/trpc/apiKeyCheck?batch=1&input="),
      { headers: { "x-clanker-api-key": "clk_test" } },
    );
  });

  test("rejects successful validation responses that do not explicitly confirm the API key", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify([{ result: { data: false } }])));

    await expect(
      setupAgents(
        { agents: ["cursor"], apiKey: "clk_test", env: {}, home: tempDir, packageRoot },
        { fetch: fetch as typeof globalThis.fetch, commandExists: noCommands },
      ),
    ).rejects.toThrow("The supplied API key is invalid.");
  });

  test("registers Codex MCP through its CLI without printing or editing config files", async () => {
    const runCommand = vi.fn(async () => ({ stdout: "", stderr: "" }));
    await setupAgents(
      { agents: ["codex"], noApiKey: true, env: {}, home: tempDir, packageRoot },
      { runCommand, commandExists: noCommands },
    );
    expect(runCommand).toHaveBeenCalledWith("codex", [
      "mcp",
      "add",
      "clankeroverflow",
      "--env",
      "CLANKER_SERVER_URL=https://api.clankeroverflow.com",
      "--",
      "npx",
      "-y",
      "@clankeroverflow/cli",
      "mcp",
    ]);
  });

  test("requires an explicit credential choice in non-interactive mode", async () => {
    await expect(
      setupAgents(
        { agents: ["cursor"], env: {}, home: tempDir, packageRoot },
        { commandExists: noCommands, stdinIsTTY: false },
      ),
    ).rejects.toThrow("Non-interactive setup requires --api-key <key> or --no-api-key.");
  });

  test("refuses to overwrite invalid OpenCode JSON", async () => {
    const opencodePath = getOpenCodeConfigPath(tempDir, {});
    await mkdir(path.dirname(opencodePath), { recursive: true });
    await writeFile(opencodePath, "{ broken");
    const results = await setupAgents(
      { agents: ["opencode"], noApiKey: true, env: {}, home: tempDir, packageRoot },
      { commandExists: noCommands },
    );
    expect(results).toContainEqual(
      expect.objectContaining({ agent: "opencode", status: "failed" }),
    );
    await expect(readFile(opencodePath, "utf8")).resolves.toBe("{ broken");
  });

  test("uninstall removes managed config entries while preserving unrelated entries", async () => {
    const cursorPath = getCursorConfigPath(tempDir);
    await mkdir(path.dirname(cursorPath), { recursive: true });
    await writeFile(
      cursorPath,
      JSON.stringify({ mcpServers: { existing: { command: "old" }, clankeroverflow: {} } }),
    );
    await setupAgents(
      { agents: ["cursor"], uninstall: true, env: {}, home: tempDir, packageRoot },
      { commandExists: noCommands },
    );
    const cursor = JSON.parse(await readFile(cursorPath, "utf8"));
    expect(cursor.mcpServers).toEqual({ existing: { command: "old" } });
  });
});
