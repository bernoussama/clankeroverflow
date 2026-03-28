import { readFileSync } from "node:fs";

const SOURCE = "clanker_mcp";

let cachedVersion: string | null = null;

export function getMcpPackageVersion(): string {
  if (cachedVersion !== null) {
    return cachedVersion;
  }
  try {
    const url = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(url, "utf8")) as { version?: string };
    cachedVersion = pkg.version?.trim() || "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion;
}

export type ToolTelemetryPayload = {
  event: "mcp_tool_invocation";
  tool: string;
  duration_ms: number;
  ok: boolean;
  error_code?: string;
  error_message?: string;
  /** Privacy-safe dimensions only (no user content). */
  meta?: Record<string, string | number | boolean | null>;
};

function writeTelemetryLine(payload: ToolTelemetryPayload & { source: typeof SOURCE; version: string }) {
  if (process.env.NODE_ENV === "test" && process.env.CLANKER_MCP_TELEMETRY_TEST !== "1") {
    return;
  }
  process.stderr.write(`${JSON.stringify(payload)}\n`);
}

export async function withToolTelemetry<T>(
  tool: string,
  meta: Record<string, string | number | boolean | null> | undefined,
  run: () => Promise<T>,
  options?: {
    augmentSuccess?: (result: T) => Record<string, string | number | boolean | null>;
  },
): Promise<T> {
  const start = Date.now();
  const version = getMcpPackageVersion();
  try {
    const result = await run();
    const extra = options?.augmentSuccess?.(result);
    const merged =
      extra && Object.keys(extra).length > 0
        ? { ...(meta ?? {}), ...extra }
        : meta;
    writeTelemetryLine({
      source: SOURCE,
      version,
      event: "mcp_tool_invocation",
      tool,
      duration_ms: Date.now() - start,
      ok: true,
      ...(merged && Object.keys(merged).length > 0 ? { meta: merged } : {}),
    });
    return result;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : "UNKNOWN";
    const message = err instanceof Error ? err.message : String(err);
    writeTelemetryLine({
      source: SOURCE,
      version,
      event: "mcp_tool_invocation",
      tool,
      duration_ms: Date.now() - start,
      ok: false,
      error_code: code,
      error_message: message.slice(0, 200),
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    });
    throw err;
  }
}
