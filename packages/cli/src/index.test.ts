import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { createProgram } from "./index";
import pc from "picocolors";

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
      expect(consoleErrorMock).toHaveBeenCalledWith(
        pc.red(pc.bold("✖ Error: ")) + pc.red("--problem is required."),
      );
    });

    test("fails if both --solution and --file are missing", async () => {
      const program = createProgram();
      try {
        await program.parseAsync(["node", "test", "log", "--problem", "test problem"]);
      } catch (e: any) {
        expect(e.message).toBe("Process.exit(1)");
      }
      expect(consoleErrorMock).toHaveBeenCalledWith(
        pc.red(pc.bold("✖ Error: ")) + pc.red("Either --solution or --file is required."),
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
        pc.green(pc.bold("✔ Success!")) +
          ` Solution logged: ${pc.cyan(pc.underline("https://clankeroverflow.com/solution/123"))}`,
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
      expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining("⚠ UNTRUSTED CONTENT:"));
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "# Problem: test problem (Score: 5)\nID: 123\nTags: react\n\n## Solution:\ntest solution\n\n---",
        ),
      );
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
      expect(consoleLogMock).toHaveBeenCalledWith(
        pc.green(pc.bold("▲ Upvoted")) + ` solution ${pc.cyan("123")}`,
      );
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
      expect(consoleLogMock).toHaveBeenCalledWith(
        pc.red(pc.bold("▼ Downvoted")) + ` solution ${pc.cyan("123")}`,
      );
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
    let setupMock: MockInstance<typeof import("./setup").setupAgents>;

    beforeEach(async () => {
      const mod = await import("./setup");
      setupMock = vi.spyOn(mod, "setupAgents").mockResolvedValue([
        { agent: "shared skills", status: "configured", detail: "/tmp/home/.agents/skills" },
        { agent: "codex", status: "configured", detail: "MCP configuration updated" },
      ]);
    });

    afterEach(() => {
      setupMock.mockRestore();
    });

    test("configures detected agents and reports results", async () => {
      const program = createProgram();
      await program.parseAsync(["node", "test", "setup", "--no-api-key"]);

      expect(setupMock).toHaveBeenCalledOnce();
      expect(consoleLogMock).toHaveBeenCalledWith(
        `\n${pc.bold(pc.magenta("=== ClankerOverflow Setup Results ==="))}`,
      );
      expect(consoleLogMock).toHaveBeenCalledWith(
        `  ${pc.bold("codex".padEnd(15))} ${pc.green("✔ configured")} - ${pc.dim("MCP configuration updated")}`,
      );
    });

    test("passes setup overrides to the orchestrator", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "test",
        "setup",
        "--agent",
        "pi,cursor",
        "--target",
        "/tmp/custom/skills",
        "--skill",
        "both",
        "--no-api-key",
        "--dry-run",
      ]);

      expect(setupMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agents: ["pi", "cursor"],
          targets: ["/tmp/custom/skills"],
          skill: "both",
          noApiKey: true,
          dryRun: true,
        }),
      );
    });

    test("handles install failure gracefully", async () => {
      setupMock.mockRejectedValue(new Error("No home directory"));

      const program = createProgram();
      try {
        await program.parseAsync(["node", "test", "setup"]);
      } catch (e: any) {
        expect(e.message).toBe("Process.exit(1)");
      }

      expect(consoleErrorMock).toHaveBeenCalledWith(
        pc.red(pc.bold("✖ Error installing ClankerOverflow:")),
      );
      expect(consoleErrorMock).toHaveBeenCalledWith(pc.red("No home directory"));
    });
  });
});
