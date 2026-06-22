import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { createProgram } from "./index";
import { LocalBackend } from "./mcp/local-backend";
import {
  DEFAULT_LOCAL_MODEL_ID,
  floatVectorToBuffer,
  type LocalSemanticConfig,
} from "./mcp/local-semantic";
import pc from "picocolors";

vi.mock("node-llama-cpp", () => ({
  getLlama: vi.fn(async () => ({
    loadModel: vi.fn(async () => ({
      trainContextSize: 8,
      tokenize: (text: string) => Array.from(text).map((char) => char.charCodeAt(0)),
      createEmbeddingContext: vi.fn(async () => ({
        getEmbeddingFor: vi.fn(async (input: number[] | string) => {
          const tokens = Array.isArray(input)
            ? input
            : Array.from(input).map((char) => char.charCodeAt(0));
          const average =
            tokens.reduce((sum, token) => sum + token, 0) / Math.max(tokens.length, 1);
          return { vector: average < 100 ? [1, 0, 0, 0] : [0, 1, 0, 0] };
        }),
      })),
    })),
  })),
}));

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

function vector(values: number[]) {
  return floatVectorToBuffer(values, values.length);
}

function writeGguf(modelPath: string) {
  writeFileSync(modelPath, Buffer.from("GGUFtest-model"));
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

    test("fails closed without a hosted request when persisted config is invalid", async () => {
      const previousXdg = process.env.XDG_CONFIG_HOME;
      const dir = mkdtempSync(join(tmpdir(), "clanker-invalid-config-"));
      process.env.XDG_CONFIG_HOME = dir;
      mkdirSync(join(dir, "clankeroverflow"), { recursive: true });
      writeFileSync(join(dir, "clankeroverflow", "config.json"), "{ broken");

      try {
        const program = createProgram();
        await expect(
          program.parseAsync([
            "node",
            "test",
            "log",
            "--problem",
            "private",
            "--solution",
            "private",
          ]),
        ).rejects.toThrow("Process.exit(1)");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleErrorMock).toHaveBeenCalledWith(
          expect.stringContaining("Invalid ClankerOverflow config"),
        );
      } finally {
        if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = previousXdg;
        rmSync(dir, { recursive: true, force: true });
      }
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
      fetchMock
        .mockImplementationOnce(async () => new Response(JSON.stringify({ result: { data: [] } })))
        .mockImplementationOnce(async () => new Response(JSON.stringify({ result: { data: [] } })));
      await program.parseAsync(["node", "test", "search", "none"]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("keyword exact returned 0"),
      );
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("keyword tiered returned 0"),
      );
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
        expect.stringContaining("Search attempts: keyword exact returned 0; hybrid returned 1."),
      );
      expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining("ID: hybrid-1"));
    });

    test("rejects an empty search query", async () => {
      const program = createProgram();
      try {
        await program.parseAsync(["node", "test", "search", "   "]);
      } catch (e: any) {
        expect(e.message).toBe("Process.exit(1)");
      }
      expect(consoleErrorMock).toHaveBeenCalledWith(
        pc.red(pc.bold("✖ Error: ")) + pc.red("search query must not be empty"),
      );
    });

    test("rejects --limit 0", async () => {
      const program = createProgram();
      try {
        await program.parseAsync(["node", "test", "search", "test", "--limit", "0"]);
      } catch (e: any) {
        expect(e.message).toBe("Process.exit(1)");
      }
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("--limit must be between 1 and 20"),
      );
    });

    test("rejects --limit above 20", async () => {
      const program = createProgram();
      try {
        await program.parseAsync(["node", "test", "search", "test", "--limit", "21"]);
      } catch (e: any) {
        expect(e.message).toBe("Process.exit(1)");
      }
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("--limit must be between 1 and 20"),
      );
    });

    test("rejects a non-integer --limit", async () => {
      const program = createProgram();
      try {
        await program.parseAsync(["node", "test", "search", "test", "--limit", "2.5"]);
      } catch (e: any) {
        expect(e.message).toBe("Process.exit(1)");
      }
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("--limit must be an integer"),
      );
    });

    test("passes a leading-dash query via the -- separator", async () => {
      await withLocalCliEnv(async () => {
        const logProgram = createProgram();
        await logProgram.parseAsync([
          "node",
          "test",
          "log",
          "--problem",
          "Negative version string mismatch",
          "--solution",
          "Parse the version as a SemVer range",
          "--tags",
          "versioning",
        ]);
        consoleLogMock.mockClear();

        const searchProgram = createProgram();
        await searchProgram.parseAsync([
          "node",
          "test",
          "search",
          "--",
          "-version",
          "--mode",
          "keyword",
        ]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleLogMock).toHaveBeenCalledWith(
          expect.stringContaining("Negative version string mismatch"),
        );
      });
    });

    test("hints at the -- separator for a bare leading-dash query", async () => {
      const program = createProgram();
      await expect(program.parseAsync(["node", "test", "search", "-1"])).rejects.toThrow();
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("clanker search -- -1"),
      );
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

    test("can explicitly search remote without changing local logging", async () => {
      await withLocalCliEnv(async () => {
        fetchMock.mockImplementationOnce(
          async () =>
            new Response(
              JSON.stringify({
                result: {
                  data: [
                    {
                      id: "remote-1",
                      problem: "remote problem",
                      solution: "remote solution",
                      score: 1,
                      tags: null,
                    },
                  ],
                },
              }),
            ),
        );
        const searchProgram = createProgram();
        await searchProgram.parseAsync([
          "node",
          "test",
          "search",
          "remote",
          "--source",
          "remote",
          "--mode",
          "keyword",
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fetchMock.mockClear();
        const logProgram = createProgram();
        await logProgram.parseAsync([
          "node",
          "test",
          "log",
          "--problem",
          "private problem",
          "--solution",
          "private solution",
        ]);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining("logged locally"));
      });
    });

    test("local search reads the explicit local database without CLANKER_MODE", async () => {
      const previousMode = process.env.CLANKER_MODE;
      const dir = mkdtempSync(join(tmpdir(), "clanker-cli-local-search-"));
      const dbPath = join(dir, "solutions.sqlite");
      try {
        delete process.env.CLANKER_MODE;
        const backend = new LocalBackend(dbPath);
        await backend.log({
          problem: "Explicit local sqlite vector search",
          solution: "Read the local SQLite database instead of the hosted API",
          tags: "sqlite-vec,local",
        });
        consoleLogMock.mockClear();

        const program = createProgram();
        await program.parseAsync([
          "node",
          "test",
          "local",
          "search",
          "sqlite",
          "--db",
          dbPath,
          "--mode",
          "keyword",
          "--limit",
          "1",
        ]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleLogMock).toHaveBeenCalledWith(
          expect.stringContaining("Explicit local sqlite vector search"),
        );
      } finally {
        if (previousMode === undefined) {
          delete process.env.CLANKER_MODE;
        } else {
          process.env.CLANKER_MODE = previousMode;
        }
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("local search supports semantic mode with embedded local rows", async () => {
      const previousMode = process.env.CLANKER_MODE;
      const previousModelPath = process.env.CLANKER_LOCAL_MODEL_PATH;
      const previousDimensions = process.env.CLANKER_LOCAL_MODEL_DIMENSIONS;
      const dir = mkdtempSync(join(tmpdir(), "clanker-cli-local-semantic-search-"));
      const dbPath = join(dir, "solutions.sqlite");
      const modelPath = join(dir, "model.gguf");
      writeGguf(modelPath);
      try {
        delete process.env.CLANKER_MODE;
        process.env.CLANKER_LOCAL_MODEL_PATH = modelPath;
        process.env.CLANKER_LOCAL_MODEL_DIMENSIONS = "4";
        const semantic: LocalSemanticConfig = {
          enabled: true,
          modelId: DEFAULT_LOCAL_MODEL_ID,
          modelPath,
          dimensions: 4,
        };
        const backend = new LocalBackend(dbPath, {
          semantic,
          embedder: {
            embed: async (text: string) =>
              /aaa/.test(text) ? vector([1, 0, 0, 0]) : vector([0, 1, 0, 0]),
          },
        });
        await backend.log({
          problem: "aaa semantic local hit",
          solution: "aaa matching vector",
          tags: "semantic",
        });
        await backend.log({
          problem: "zzz semantic local miss",
          solution: "zzz other vector",
          tags: "semantic",
        });
        consoleLogMock.mockClear();

        const program = createProgram();
        await program.parseAsync([
          "node",
          "test",
          "local",
          "search",
          "aaa",
          "--db",
          dbPath,
          "--mode",
          "semantic",
          "--limit",
          "1",
        ]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleLogMock).toHaveBeenCalledWith(
          expect.stringContaining("aaa semantic local hit"),
        );
      } finally {
        if (previousMode === undefined) {
          delete process.env.CLANKER_MODE;
        } else {
          process.env.CLANKER_MODE = previousMode;
        }
        if (previousModelPath === undefined) {
          delete process.env.CLANKER_LOCAL_MODEL_PATH;
        } else {
          process.env.CLANKER_LOCAL_MODEL_PATH = previousModelPath;
        }
        if (previousDimensions === undefined) {
          delete process.env.CLANKER_LOCAL_MODEL_DIMENSIONS;
        } else {
          process.env.CLANKER_LOCAL_MODEL_DIMENSIONS = previousDimensions;
        }
        rmSync(dir, { recursive: true, force: true });
      }
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

    test("can explicitly vote remotely while configured local", async () => {
      await withLocalCliEnv(async () => {
        fetchMock.mockImplementationOnce(
          async () => new Response(JSON.stringify({ result: { data: undefined } })),
        );
        const program = createProgram();
        await program.parseAsync(["node", "test", "upvote", "remote-1", "--source", "remote"]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0].toString()).toContain("solutions.vote");
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

  describe("config commands", () => {
    test("persists and displays mode without storing credentials", async () => {
      const previousXdg = process.env.XDG_CONFIG_HOME;
      const previousApiKey = process.env.CLANKER_API_KEY;
      const dir = mkdtempSync(join(tmpdir(), "clanker-config-command-"));
      process.env.XDG_CONFIG_HOME = dir;
      process.env.CLANKER_API_KEY = "clk_secret";

      try {
        const setProgram = createProgram();
        await setProgram.parseAsync(["node", "test", "config", "set", "mode", "local"]);
        const stored = JSON.parse(
          readFileSync(join(dir, "clankeroverflow", "config.json"), "utf8"),
        );
        expect(stored.mode).toBe("local");
        expect(JSON.stringify(stored)).not.toContain("clk_secret");

        consoleLogMock.mockClear();
        const showProgram = createProgram();
        await showProgram.parseAsync(["node", "test", "config", "show", "--json"]);
        const shown = JSON.parse(String(consoleLogMock.mock.calls[0]?.[0]));
        expect(shown.mode).toBe("local");
        expect(shown.persisted).toBe(true);
      } finally {
        if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = previousXdg;
        if (previousApiKey === undefined) delete process.env.CLANKER_API_KEY;
        else process.env.CLANKER_API_KEY = previousApiKey;
        rmSync(dir, { recursive: true, force: true });
      }
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
        "--mode",
        "remote",
        "--dry-run",
      ]);

      expect(setupMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agents: ["pi", "cursor"],
          targets: ["/tmp/custom/skills"],
          skill: "both",
          noApiKey: true,
          mode: "remote",
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
