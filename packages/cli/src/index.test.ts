import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { createProgram } from "./index";
import pc from "picocolors";

async function withLocalCliEnv<T>(run: (dbPath: string) => Promise<T>) {
  const previousMode = process.env.CLANKER_MODE;
  const previousDb = process.env.CLANKER_LOCAL_DB;
  const previousSemantic = process.env.CLANKER_LOCAL_SEMANTIC;
  const dir = mkdtempSync(join(tmpdir(), "clanker-cli-local-"));

  try {
    process.env.CLANKER_MODE = "local";
    process.env.CLANKER_LOCAL_DB = join(dir, "solutions.sqlite");
    process.env.CLANKER_LOCAL_SEMANTIC = "0";
    return await run(process.env.CLANKER_LOCAL_DB);
  } finally {
    if (previousMode === undefined) {
      delete process.env.CLANKER_MODE;
    } else {
      process.env.CLANKER_MODE = previousMode;
    }
    if (previousDb === undefined) {
      delete process.env.CLANKER_LOCAL_DB;
    } else {
      process.env.CLANKER_LOCAL_DB = previousDb;
    }
    if (previousSemantic === undefined) {
      delete process.env.CLANKER_LOCAL_SEMANTIC;
    } else {
      process.env.CLANKER_LOCAL_SEMANTIC = previousSemantic;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

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

    test("logs locally without calling the hosted API", async () => {
      await withLocalCliEnv(async () => {
        const program = createProgram();
        await program.parseAsync([
          "node",
          "test",
          "log",
          "--problem",
          "Local SQLite WAL busy error",
          "--solution",
          "Close stale readers before retrying the write transaction",
          "--tags",
          "sqlite,local",
        ]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleLogMock).toHaveBeenCalledWith(
          expect.stringContaining("Solution logged locally:"),
        );
      });
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

    test("handles no solutions found with auto fallback guidance when unauthenticated", async () => {
      const program = createProgram();
      fetchMock.mockImplementationOnce(
        async () => new Response(JSON.stringify({ result: { data: [] } })),
      );
      await program.parseAsync(["node", "test", "search", "none"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining("keyword returned 0"));
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("CLANKER_API_KEY is required for hosted hybrid fallback"),
      );
      expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining("No solutions found."));
    });

    test("auto mode falls back to hybrid after an empty keyword search when authenticated", async () => {
      const previousApiKey = process.env.CLANKER_API_KEY;
      process.env.CLANKER_API_KEY = "test-key";
      const program = createProgram();
      fetchMock
        .mockImplementationOnce(async () => new Response(JSON.stringify({ result: { data: [] } })))
        .mockImplementationOnce(
          async () =>
            new Response(
              JSON.stringify({
                result: {
                  data: [
                    {
                      id: "hybrid-1",
                      problem: "hybrid problem",
                      solution: "hybrid solution",
                      score: 1,
                      tags: "search",
                    },
                  ],
                },
              }),
            ),
        );

      try {
        await program.parseAsync(["node", "test", "search", "conceptual miss"]);
      } finally {
        if (previousApiKey === undefined) {
          delete process.env.CLANKER_API_KEY;
        } else {
          process.env.CLANKER_API_KEY = previousApiKey;
        }
      }

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("Search attempts: keyword returned 0; hybrid returned 1."),
      );
      expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining("ID: hybrid-1"));
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

    test("searches local solutions without calling the hosted API", async () => {
      await withLocalCliEnv(async () => {
        const logProgram = createProgram();
        await logProgram.parseAsync([
          "node",
          "test",
          "log",
          "--problem",
          "Local sqlite vector extension fails to load",
          "--solution",
          "Install the Node native dependency inside the same runtime image",
          "--tags",
          "sqlite-vec,docker",
        ]);
        consoleLogMock.mockClear();

        const searchProgram = createProgram();
        await searchProgram.parseAsync([
          "node",
          "test",
          "search",
          "sqlite-vec",
          "--mode",
          "keyword",
          "--limit",
          "1",
        ]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining("sqlite vector"));
        expect(consoleLogMock).toHaveBeenCalledWith(
          expect.stringContaining("Tags: sqlite-vec,docker"),
        );
      });
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

    test("votes locally without calling the hosted API", async () => {
      await withLocalCliEnv(async () => {
        const logProgram = createProgram();
        await logProgram.parseAsync([
          "node",
          "test",
          "log",
          "--problem",
          "Local vote target",
          "--solution",
          "Use the local backend",
        ]);
        const logged = consoleLogMock.mock.calls
          .map((call) => call.join(""))
          .find((line) => line.includes("Solution logged locally:"));
        const id = logged?.match(/[0-9a-f-]{36}/)?.[0];
        expect(id).toBeDefined();
        consoleLogMock.mockClear();

        const upvoteProgram = createProgram();
        await upvoteProgram.parseAsync(["node", "test", "upvote", id!]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleLogMock).toHaveBeenCalledWith(
          pc.green(pc.bold("▲ Upvoted")) + ` solution ${pc.cyan(id!)}`,
        );
      });
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
