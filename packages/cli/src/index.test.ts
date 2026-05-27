import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { createProgram } from "./index";

describe("CLI", () => {
  let consoleLogMock: MockInstance<typeof console.log>;
  let consoleErrorMock: MockInstance<typeof console.error>;
  let processExitMock: MockInstance<typeof process.exit>;
  let fetchMock: MockInstance<typeof global.fetch>;

  beforeEach(() => {
    consoleLogMock = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitMock = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`Process.exit(${code})`);
    }) as any);
    fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ result: { data: {} } }), {
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  afterEach(() => {
    consoleLogMock.mockRestore();
    consoleErrorMock.mockRestore();
    processExitMock.mockRestore();
    fetchMock.mockRestore();
  });

  describe("log command", () => {
    test("fails if --problem is missing", async () => {
      const program = createProgram();
      try {
        await program.parseAsync(["node", "test", "log", "--solution", "test solution"]);
      } catch (e: any) {
        expect(e.message).toBe("Process.exit(1)");
      }
      expect(consoleErrorMock).toHaveBeenCalledWith("Error: --problem is required.");
    });

    test("fails if both --solution and --file are missing", async () => {
      const program = createProgram();
      try {
        await program.parseAsync(["node", "test", "log", "--problem", "test problem"]);
      } catch (e: any) {
        expect(e.message).toBe("Process.exit(1)");
      }
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Error: Either --solution or --file is required.",
      );
    });

    test("successfully logs a solution", async () => {
      const program = createProgram();
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: { id: "123" } } })),
      );
      await program.parseAsync([
        "node",
        "test",
        "log",
        "--problem",
        "test problem",
        "--solution",
        "test solution",
        "--tags",
        "react",
      ]);

      expect(fetchMock).toHaveBeenCalled();
      const fetchCallUrl = fetchMock.mock.calls[0][0].toString();
      expect(fetchCallUrl).toMatch(/^https:\/\/api\.clankeroverflow\.com\/trpc/);
      expect(fetchCallUrl).toContain("solutions.log");
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("Success! Solution logged: https://clankeroverflow.com/solution/123"),
      );
    });
  });

  describe("search command", () => {
    test("successfully searches for solutions", async () => {
      const program = createProgram();
      fetchMock.mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                data: [
                  {
                    id: "123",
                    problem: "test problem",
                    solution: "test solution",
                    score: 5,
                    tags: "react",
                  },
                ],
              },
            }),
          ),
      );
      await program.parseAsync(["node", "test", "search", "test", "--limit", "1"]);

      expect(fetchMock).toHaveBeenCalled();
      const fetchCallUrl = fetchMock.mock.calls[0][0].toString();
      expect(fetchCallUrl).toContain("solutions.search");
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("# Problem: test problem"),
      );
      expect(consoleLogMock).toHaveBeenCalledWith("ID: 123");
    });

    test("handles no solutions found", async () => {
      const program = createProgram();
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: [] } })),
      );
      await program.parseAsync(["node", "test", "search", "none"]);
      expect(consoleLogMock).toHaveBeenCalledWith("No solutions found.");
    });

    test("strips terminal control characters from search results", async () => {
      const program = createProgram();
      // Simulate a malicious result with ANSI escape sequences
      fetchMock.mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                data: [
                  {
                    id: "bad-1",
                    problem: "\x1B[31mFake Error\x1B[0m",
                    solution: "Run \x1B]52;c;hidden\x07 to fix",
                    score: 0,
                    tags: "\x1B[2Jevil",
                  },
                ],
              },
            }),
          ),
      );
      await program.parseAsync(["node", "test", "search", "evil"]);

      // Verify control characters were stripped from output
      const allOutput = consoleLogMock.mock.calls.map((call: any) => call.join("")).join("");
      expect(allOutput).not.toContain("\x1B");
      expect(allOutput).not.toContain("\x07");
      expect(allOutput).toContain("Fake Error");
    });
  });

  describe("vote commands", () => {
    test("successfully upvotes", async () => {
      const program = createProgram();
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: undefined } })),
      );
      await program.parseAsync(["node", "test", "upvote", "123"]);
      expect(fetchMock).toHaveBeenCalled();
      const fetchCallUrl = fetchMock.mock.calls[0][0].toString();
      expect(fetchCallUrl).toContain("solutions.vote");
      expect(consoleLogMock).toHaveBeenCalledWith("Successfully upvoted solution 123");
    });

    test("successfully downvotes", async () => {
      const program = createProgram();
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: undefined } })),
      );
      await program.parseAsync(["node", "test", "downvote", "123"]);
      expect(fetchMock).toHaveBeenCalled();
      const fetchCallUrl = fetchMock.mock.calls[0][0].toString();
      expect(fetchCallUrl).toContain("solutions.vote");
      expect(consoleLogMock).toHaveBeenCalledWith("Successfully downvoted solution 123");
    });
  });

  describe("mcp command", () => {
    test("starts the MCP server from the CLI", async () => {
      const startMcpServer = vi.fn(async () => {});
      const program = createProgram({ startMcpServer });

      await program.parseAsync(["node", "test", "mcp"]);

      expect(startMcpServer).toHaveBeenCalledOnce();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("setup command", () => {
    let installMock: MockInstance<typeof import("./postinstall").installBundledSkill>;
    let pluginInstallMock: MockInstance<typeof import("./plugin/install").installPlugin>;

    beforeEach(async () => {
      const mod = await import("./postinstall");
      installMock = vi.spyOn(mod, "installBundledSkill").mockResolvedValue([
        "/tmp/xdg-config/opencode/skills/clankeroverflow-mcp",
        "/tmp/home/.agents/skills/clankeroverflow-mcp",
      ]);
      const pluginMod = await import("./plugin/install");
      pluginInstallMock = vi.spyOn(pluginMod, "installPlugin").mockResolvedValue("/tmp/home/.claude/plugins/clankeroverflow");
    });

    afterEach(() => {
      installMock.mockRestore();
      pluginInstallMock.mockRestore();
    });

    test("installs the skill and reports paths", async () => {
      const program = createProgram();
      await program.parseAsync(["node", "test", "setup"]);

      expect(installMock).toHaveBeenCalledOnce();
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("ClankerOverflow skill installed to:"),
      );
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("/tmp/xdg-config/opencode/skills/clankeroverflow-mcp"),
      );
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("/tmp/home/.agents/skills/clankeroverflow-mcp"),
      );
    });

    test("passes --target as CLANKER_SKILLS_DIRS to installBundledSkill", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "test",
        "setup",
        "--target",
        "/tmp/custom/skills",
      ]);

      expect(installMock).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            CLANKER_SKILLS_DIRS: "/tmp/custom/skills",
          }),
        }),
      );
    });

    test("merges --target with existing CLANKER_SKILLS_DIRS env var", async () => {
      const original = process.env.CLANKER_SKILLS_DIRS;
      process.env.CLANKER_SKILLS_DIRS = "/tmp/existing";

      try {
        const program = createProgram();
        await program.parseAsync([
          "node",
          "test",
          "setup",
          "--target",
          "/tmp/extra",
        ]);

        expect(installMock).toHaveBeenCalledWith(
          expect.objectContaining({
            env: expect.objectContaining({
              CLANKER_SKILLS_DIRS: "/tmp/existing,/tmp/extra",
            }),
          }),
        );
      } finally {
        if (original === undefined) {
          delete process.env.CLANKER_SKILLS_DIRS;
        } else {
          process.env.CLANKER_SKILLS_DIRS = original;
        }
      }
    });

    test("handles install failure gracefully", async () => {
      installMock.mockRejectedValue(new Error("No home directory"));

      const program = createProgram();
      try {
        await program.parseAsync(["node", "test", "setup"]);
      } catch (e: any) {
        expect(e.message).toBe("Process.exit(1)");
      }

      expect(consoleErrorMock).toHaveBeenCalledWith("Error installing ClankerOverflow:");
      expect(consoleErrorMock).toHaveBeenCalledWith("No home directory");
    });
  });
});
