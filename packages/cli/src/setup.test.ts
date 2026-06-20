import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { detectAgents, getCursorConfigPath, getOpenCodeConfigPath, setupAgents } from "./setup";
import pc from "picocolors";

const setupSource = await readFile(new URL("./setup.ts", import.meta.url), "utf8");

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

  test("handles browser opener spawn failures without crashing setup", () => {
    expect(setupSource).toContain('child.on("error"');
    expect(setupSource).toContain("Browser opening is optional");
  });

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

  test("configures local semantic MCP environment without an API key", async () => {
    await setupAgents(
      {
        agents: ["cursor"],
        env: {},
        home: tempDir,
        local: true,
        localDb: "/tmp/clanker.sqlite",
        localModelPath: "/tmp/bge.gguf",
        localSemantic: true,
        packageRoot,
      },
      { commandExists: noCommands, stdinIsTTY: false },
    );

    const cursor = JSON.parse(await readFile(getCursorConfigPath(tempDir), "utf8"));
    expect(cursor.mcpServers.clankeroverflow.env).toEqual({
      CLANKER_MODE: "local",
      CLANKER_LOCAL_DB: "/tmp/clanker.sqlite",
      CLANKER_LOCAL_SEMANTIC: "1",
      CLANKER_LOCAL_MODEL_PATH: "/tmp/bge.gguf",
    });
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

  test("prints the plaintext storage warning", async () => {
    const output: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((message) => output.push(message));
    const warn = vi.spyOn(console, "warn").mockImplementation((message) => output.push(message));

    try {
      await setupAgents(
        { agents: ["cursor"], env: {}, home: tempDir, packageRoot },
        {
          commandExists: noCommands,
          stdinIsTTY: true,
          promptConfirm: async () => false,
          promptSecret: async () => "",
        },
      );
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }

    expect(output).toEqual([
      pc.yellow(pc.bold("⚠️  Warning: ")) +
        "the API key will be stored as plaintext in configured agent MCP files.",
    ]);
  });

  test("can create an API key through browser device authorization", async () => {
    const cursorPath = getCursorConfigPath(tempDir);
    await mkdir(path.dirname(cursorPath), { recursive: true });
    const openBrowser = vi.fn(async () => {});
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/device/code")) {
        return new Response(
          JSON.stringify({
            device_code: "device-123",
            user_code: "ABCD-EFGH",
            verification_uri: "https://clankeroverflow.com/cli-auth",
            verification_uri_complete: "https://clankeroverflow.com/cli-auth?user_code=ABCD-EFGH",
            expires_in: 600,
            interval: 5,
          }),
        );
      }
      if (url.endsWith("/auth/device/token")) {
        return new Response(
          JSON.stringify({
            access_token: "device-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid profile email",
          }),
        );
      }
      if (url.includes("/trpc/cliAuth.exchangeDeviceToken")) {
        return new Response(JSON.stringify([{ result: { data: { key: "clk_browser" } } }]));
      }
      if (url.includes("/trpc/apiKeyCheck")) {
        return new Response(JSON.stringify([{ result: { data: true } }]));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await setupAgents(
      { agents: ["cursor"], env: {}, home: tempDir, packageRoot },
      {
        commandExists: noCommands,
        fetch: fetch as typeof globalThis.fetch,
        openBrowser,
        promptConfirm: async () => true,
        sleep: async () => {},
        stdinIsTTY: true,
      },
    );

    expect(openBrowser).toHaveBeenCalledWith(
      "https://clankeroverflow.com/cli-auth?user_code=ABCD-EFGH",
    );
    const cursor = JSON.parse(await readFile(cursorPath, "utf8"));
    expect(cursor.mcpServers.clankeroverflow.env.CLANKER_API_KEY).toBe("clk_browser");
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
