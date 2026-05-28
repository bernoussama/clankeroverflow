import type { Context, MiddlewareHandler } from "hono";

type RequestLogEnv = {
  Variables: {
    requestLog?: RequestLogEvent;
  };
  Bindings: {
    COMMIT_SHA?: string;
    ENVIRONMENT?: string;
    SERVICE_VERSION?: string;
  };
};

export const REQUEST_ID_HEADER = "x-request-id";

export type RequestLogEvent = Record<string, unknown> & {
  event: "api_request";
  message: string;
  service: "server";
  timestamp: string;
  request_id: string;
  method: string;
  path: string;
  outcome: "success" | "error";
  status_code: number;
  duration_ms: number;
};

function logInfo(event: RequestLogEvent) {
  console.info(JSON.stringify(event));
}

function logError(event: RequestLogEvent) {
  console.error(JSON.stringify(event));
}

function getRequestId(c: Context) {
  return c.req.header(REQUEST_ID_HEADER) ?? c.req.header("cf-ray") ?? crypto.randomUUID();
}

function getRequestIdentity(c: Context) {
  const forwardedFor = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();
  return firstForwardedIp ? `ip:${firstForwardedIp}` : "ip:unknown";
}

function getCfColo(c: Context) {
  const cf = (c.req.raw as Request & { cf?: { colo?: unknown } }).cf;
  return typeof cf?.colo === "string" ? cf.colo : undefined;
}

function getRouteFamily(path: string) {
  if (path.startsWith("/trpc/")) return "trpc";
  if (path.startsWith("/auth/")) return "auth";
  if (path.startsWith("/.well-known/")) return "well-known";
  return "public";
}

function getRequestLogMessage(event: RequestLogEvent) {
  return `${event.method} ${event.path} completed with ${event.status_code} (${event.outcome})`;
}

function getDeploymentMetadata(c: Context<RequestLogEnv>) {
  return {
    runtime: "cloudflare-workers",
    deployment_environment: c.env?.ENVIRONMENT?.trim() || "unknown",
    service_version: c.env?.SERVICE_VERSION?.trim() || "unknown",
    commit_sha: c.env?.COMMIT_SHA?.trim() || "unknown",
  };
}

function omitUndefined(event: RequestLogEvent) {
  return Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined));
}

export const withRequestLogging: MiddlewareHandler<RequestLogEnv> = async (c, next) => {
  const startedAt = Date.now();
  const path = new URL(c.req.url).pathname;
  const requestLog: RequestLogEvent = {
    event: "api_request",
    message: "",
    service: "server",
    ...getDeploymentMetadata(c),
    timestamp: new Date(startedAt).toISOString(),
    request_id: getRequestId(c),
    method: c.req.method,
    path,
    route_family: getRouteFamily(path),
    origin: c.req.header("origin"),
    user_agent: c.req.header("user-agent"),
    cf_ray: c.req.header("cf-ray"),
    cf_colo: getCfColo(c),
    request_identity: getRequestIdentity(c),
    outcome: "success",
    status_code: 200,
    duration_ms: 0,
  };

  c.set("requestLog", requestLog);

  try {
    await next();
    requestLog.status_code = c.res.status;
    requestLog.outcome = c.res.status >= 500 ? "error" : "success";
  } catch (error) {
    requestLog.status_code = 500;
    requestLog.outcome = "error";
    requestLog.error_type = error instanceof Error ? error.name : typeof error;
    requestLog.error_message = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    requestLog.duration_ms = Date.now() - startedAt;
    requestLog.message = getRequestLogMessage(requestLog);
    c.header(REQUEST_ID_HEADER, requestLog.request_id);
    const event = omitUndefined(requestLog) as RequestLogEvent;
    if (event.outcome === "error") {
      logError(event);
    } else {
      logInfo(event);
    }
  }
};
