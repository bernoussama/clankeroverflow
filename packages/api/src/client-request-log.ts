import { TRPCError } from "@trpc/server";

import type { Context } from "./context";

export type ClientKind = "mcp" | "unknown";

/** Privacy-safe dimensions for MCP-originated solution procedures (no raw content). */
export function privacyMetaForSolutionsProcedure(
  clientKind: ClientKind,
  path: string,
  input: unknown,
): Record<string, string | number | boolean> | undefined {
  if (clientKind !== "mcp" || !path.startsWith("solutions.")) {
    return undefined;
  }

  const i = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  if (path === "solutions.search") {
    const q = i.query;
    return {
      mode: typeof i.mode === "string" ? i.mode : "keyword",
      limit: typeof i.limit === "number" ? i.limit : 0,
      query_len: typeof q === "string" ? q.trim().length : 0,
    };
  }

  if (path === "solutions.log") {
    return {
      problem_len: typeof i.problem === "string" ? i.problem.length : 0,
      solution_len: typeof i.solution === "string" ? i.solution.length : 0,
      has_tags: typeof i.tags === "string" ? i.tags.trim().length > 0 : false,
    };
  }

  if (path === "solutions.vote") {
    return {
      is_upvote: Boolean(i.isUpvote),
      solution_id_len: typeof i.id === "string" ? i.id.length : 0,
    };
  }

  return undefined;
}

export function logTrpcProcedureLine(
  ctx: Context,
  path: string,
  input: unknown,
  durationMs: number,
  ok: boolean,
  errorCode?: string,
) {
  const clientKind: ClientKind = ctx.clientKind ?? "unknown";
  const payload: Record<string, unknown> = {
    source: "clanker_api",
    event: "trpc_procedure",
    path,
    duration_ms: durationMs,
    ok,
    client: clientKind,
  };

  if (clientKind === "mcp" && ctx.clientMcpVersion) {
    payload.mcp_version = ctx.clientMcpVersion;
  }

  if (!ok && errorCode) {
    payload.error_code = errorCode;
  }

  const meta = privacyMetaForSolutionsProcedure(clientKind, path, input);
  if (meta && Object.keys(meta).length > 0) {
    payload.meta = meta;
  }

  console.log(JSON.stringify(payload));
}

export function trpcErrorCode(err: unknown): string | undefined {
  if (err instanceof TRPCError) {
    return err.code;
  }
  return undefined;
}
