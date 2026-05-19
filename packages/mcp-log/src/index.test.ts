import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpLogger } from "./index.js";

// Minimal writable stream double that captures written chunks.
function makeStream() {
  const chunks: string[] = [];
  return {
    write(chunk: string) {
      chunks.push(chunk);
    },
    lines() {
      return chunks
        .join("")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    },
  };
}

describe("McpLogger", () => {
  describe("output target", () => {
    it("defaults to process.stderr when no name/level/path are given", () => {
      const spy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      const logger = new McpLogger({ name: "test" });
      logger.info("hello");
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });

    it("writes to a provided stderr stream instead of process.stderr", () => {
      const stream = makeStream();
      const processSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      new McpLogger({
        name: "test",
        stderr: stream as unknown as NodeJS.WriteStream,
      }).info("hi");
      expect(processSpy).not.toHaveBeenCalled();
      expect(stream.lines()).toHaveLength(1);
      processSpy.mockRestore();
    });

    it("never writes to process.stdout", () => {
      const spy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      const stream = makeStream();
      new McpLogger({
        name: "test",
        stderr: stream as unknown as NodeJS.WriteStream,
      }).info("msg");
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("CLANKER_LOG_FILE env var", () => {
    let tmpFile: string;

    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `mcp-log-test-${Date.now()}.jsonl`);
    });

    afterEach(() => {
      delete process.env["CLANKER_LOG_FILE"];
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* already gone */
      }
    });

    it("writes to CLANKER_LOG_FILE when set", async () => {
      process.env["CLANKER_LOG_FILE"] = tmpFile;
      const logger = new McpLogger({ name: "test" });
      logger.info("file-write");
      // Give the stream a tick to flush
      await new Promise((r) => setTimeout(r, 20));
      const lines = fs
        .readFileSync(tmpFile, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ level: "info", msg: "file-write" });
    });

    it("filePath option takes priority over CLANKER_LOG_FILE", async () => {
      const envFile = path.join(os.tmpdir(), `mcp-log-env-${Date.now()}.jsonl`);
      process.env["CLANKER_LOG_FILE"] = envFile;
      const logger = new McpLogger({ name: "test", filePath: tmpFile });
      logger.info("explicit-path");
      await new Promise((r) => setTimeout(r, 20));
      expect(fs.existsSync(envFile)).toBe(false);
      const lines = fs
        .readFileSync(tmpFile, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(lines[0]).toMatchObject({ msg: "explicit-path" });
      try {
        fs.unlinkSync(envFile);
      } catch {
        /* ok */
      }
    });
  });

  describe("JSON line format", () => {
    it("emits valid JSON with name, level, time, and msg fields", () => {
      const stream = makeStream();
      new McpLogger({
        name: "my-server",
        stderr: stream as unknown as NodeJS.WriteStream,
      }).info("test msg");
      const [line] = stream.lines();
      expect(line.name).toBe("my-server");
      expect(line.level).toBe("info");
      expect(line.msg).toBe("test msg");
      expect(typeof line.time).toBe("string");
      // ISO 8601 timestamp
      expect(() => new Date(line.time)).not.toThrow();
    });

    it("merges extra fields into the JSON line", () => {
      const stream = makeStream();
      new McpLogger({
        name: "test",
        stderr: stream as unknown as NodeJS.WriteStream,
      }).error("oops", { code: 42, path: "/foo" });
      const [line] = stream.lines();
      expect(line.code).toBe(42);
      expect(line.path).toBe("/foo");
    });

    it("each call produces exactly one newline-terminated line", () => {
      const stream = makeStream();
      const logger = new McpLogger({
        name: "test",
        stderr: stream as unknown as NodeJS.WriteStream,
      });
      logger.info("a");
      logger.warn("b");
      expect(stream.lines()).toHaveLength(2);
    });
  });

  describe("level filtering", () => {
    it("defaults to info — suppresses debug", () => {
      const stream = makeStream();
      const logger = new McpLogger({
        name: "test",
        stderr: stream as unknown as NodeJS.WriteStream,
      });
      logger.debug("should be hidden");
      logger.info("visible");
      expect(stream.lines()).toHaveLength(1);
      expect(stream.lines()[0]!.msg).toBe("visible");
    });

    it("respects level: debug — emits all levels", () => {
      const stream = makeStream();
      const logger = new McpLogger({
        name: "test",
        level: "debug",
        stderr: stream as unknown as NodeJS.WriteStream,
      });
      logger.debug("d");
      logger.info("i");
      logger.warn("w");
      logger.error("e");
      expect(stream.lines()).toHaveLength(4);
    });

    it("respects level: error — only emits error", () => {
      const stream = makeStream();
      const logger = new McpLogger({
        name: "test",
        level: "error",
        stderr: stream as unknown as NodeJS.WriteStream,
      });
      logger.debug("d");
      logger.info("i");
      logger.warn("w");
      logger.error("e");
      expect(stream.lines()).toHaveLength(1);
      expect(stream.lines()[0]!.level).toBe("error");
    });

    it("respects level: warn — emits warn and error", () => {
      const stream = makeStream();
      const logger = new McpLogger({
        name: "test",
        level: "warn",
        stderr: stream as unknown as NodeJS.WriteStream,
      });
      logger.info("i");
      logger.warn("w");
      logger.error("e");
      const levels = stream.lines().map((l) => l.level);
      expect(levels).toEqual(["warn", "error"]);
    });
  });
});
