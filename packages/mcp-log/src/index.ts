import fs from "node:fs";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface McpLogger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export const McpLogger = {
  make(options: {
    name: string;
    level?: LogLevel;
    filePath?: string;
    stderr?: NodeJS.WriteStream;
  }): McpLogger {
    const minRank = LEVEL_RANK[options.level ?? "info"];
    const name = options.name;

    // Priority: explicit filePath > CLANKER_LOG_FILE env > provided stderr > process.stderr
    const resolvedPath = options.filePath ?? process.env["CLANKER_LOG_FILE"];

    const out: NodeJS.WriteStream | fs.WriteStream = resolvedPath
      ? fs.createWriteStream(resolvedPath, { flags: "a" })
      : (options.stderr ?? process.stderr);

    const write = (
      level: LogLevel,
      message: string,
      extra?: Record<string, unknown>,
    ): void => {
      if (LEVEL_RANK[level] < minRank) return;

      const line =
        JSON.stringify({
          name,
          level,
          time: new Date().toISOString(),
          msg: message,
          ...extra,
        }) + "\n";

      out.write(line);
    };

    return {
      debug: (msg, extra) => write("debug", msg, extra),
      info: (msg, extra) => write("info", msg, extra),
      warn: (msg, extra) => write("warn", msg, extra),
      error: (msg, extra) => write("error", msg, extra),
    };
  },
} as const;
