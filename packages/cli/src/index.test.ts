import { describe, expect, test, spyOn, beforeEach, afterEach, type Mock } from "bun:test";
import { createProgram } from "./index";

describe("CLI", () => {
  let consoleLogMock: Mock<typeof console.log>;
  let consoleErrorMock: Mock<typeof console.error>;
  let processExitMock: Mock<typeof process.exit>;
  let fetchMock: Mock<typeof global.fetch>;

  beforeEach(() => {
    consoleLogMock = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorMock = spyOn(console, "error").mockImplementation(() => {});
    processExitMock = spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`Process.exit(${code})`);
    }) as any);
    fetchMock = spyOn(global, "fetch").mockImplementation(async () => {
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
      expect(fetchCallUrl).toStartWith("https://api.clankeroverflow.com/trpc");
      expect(fetchCallUrl).toContain("solutions.log");
      expect(consoleLogMock).toHaveBeenCalledWith(
        expect.stringContaining("Success! Solution logged:"),
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
});
