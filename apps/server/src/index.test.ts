import { afterEach, describe, expect, test, vi } from "vitest";
import { mockWorkerEnv } from "../test-setup";
import defaultHandler, { app, sentryOptionsForEnv } from "./index";

describe("Server", () => {
  const { createDbMock, posthogInstances, sentryCaptureExceptionMock, sentryWithSentryMock } = (
    globalThis as any
  ).__serverTestMocks;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function spyRequestLogs() {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    return { info, error };
  }

  function parseLog(call: unknown[]) {
    expect(call).toHaveLength(1);
    expect(typeof call[0]).toBe("string");
    return JSON.parse(call[0] as string) as Record<string, unknown>;
  }

  test("GET / should return OK", async () => {
    const res = await app.request("/", undefined, mockWorkerEnv);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  test("default export should wrap the worker with Sentry", () => {
    expect(defaultHandler).toBe(app);
    expect(sentryWithSentryMock).toHaveBeenCalledWith(expect.any(Function), app);
  });

  test("Sentry should be configured for Cloudflare error monitoring", () => {
    expect(sentryOptionsForEnv(mockWorkerEnv)).toMatchObject({
      dsn: "https://2c5a2f26e1dabc117e673996410d02cb@o4511458204319744.ingest.de.sentry.io/4511458219458640",
      enableLogs: true,
      environment: "test",
      release: "test-version",
      sendDefaultPii: true,
      tracesSampleRate: 1,
    });
  });

  test("Sentry should use COMMIT_SHA as release fallback", () => {
    expect(
      sentryOptionsForEnv({
        COMMIT_SHA: "test-commit",
        ENVIRONMENT: "test",
      }),
    ).toMatchObject({
      release: "test-commit",
    });
  });

  test("GET / should advertise OAuth protected resource metadata", async () => {
    const res = await app.request("/", undefined, mockWorkerEnv);

    expect(res.headers.get("Link")).toContain("/.well-known/oauth-protected-resource");
    expect(res.headers.get("Link")).toContain('rel="oauth-protected-resource"');
  });

  test("GET /.well-known/oauth-protected-resource should publish RFC 9728 metadata", async () => {
    const res = await app.request(
      "/.well-known/oauth-protected-resource",
      undefined,
      mockWorkerEnv,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(body.resource).toBe("https://api.clankeroverflow.com");
    expect(body.authorization_servers).toContain("https://api.clankeroverflow.com/auth");
    expect(body.scopes_supported).toContain("solutions:read");
    expect(body.scopes_supported).toContain("solutions:write");
    expect(body.bearer_methods_supported).toContain("header");
  });

  test("POST /internal/sentry-test should capture a Sentry smoke-test event", async () => {
    sentryCaptureExceptionMock.mockClear();

    const res = await app.request(
      "/internal/sentry-test",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-sentry-token",
        },
      },
      mockWorkerEnv,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ eventId: "test-sentry-event-id", ok: true });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
      tags: {
        smoke_test: "true",
      },
    });
  });

  test("POST /internal/sentry-test should stay hidden without a configured token", async () => {
    sentryCaptureExceptionMock.mockClear();

    const res = await app.request(
      "/internal/sentry-test",
      {
        method: "POST",
      },
      {
        ...mockWorkerEnv,
        SENTRY_TEST_TOKEN: undefined,
      },
    );

    expect(res.status).toBe(404);
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled();
  });

  test("POST /internal/sentry-test should reject invalid tokens", async () => {
    sentryCaptureExceptionMock.mockClear();

    const res = await app.request(
      "/internal/sentry-test",
      {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-token",
        },
      },
      mockWorkerEnv,
    );

    expect(res.status).toBe(403);
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled();
  });

  test("GET / should include hardened security headers", async () => {
    const res = await app.request("/", undefined, mockWorkerEnv);

    expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-site");
    expect(res.headers.get("Origin-Agent-Cluster")).toBe("?1");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-DNS-Prefetch-Control")).toBe("off");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(res.headers.get("Permissions-Policy")).not.toContain("browsing-topics");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  test("GET /trpc/healthCheck should disable caching", async () => {
    const res = await app.request("/trpc/healthCheck", undefined, mockWorkerEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Pragma")).toBe("no-cache");
  });

  test("GET /trpc/healthCheck should use a request-scoped PostHog client from Worker bindings", async () => {
    posthogInstances.length = 0;

    const res = await app.request("/trpc/healthCheck", undefined, mockWorkerEnv);

    expect(res.status).toBe(200);
    expect(posthogInstances).toHaveLength(1);
    expect(posthogInstances[0].apiKey).toBe(mockWorkerEnv.POSTHOG_API_KEY);
    expect(posthogInstances[0].options).toMatchObject({
      host: mockWorkerEnv.POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
      enableExceptionAutocapture: true,
    });
    expect(posthogInstances[0].shutdown).toHaveBeenCalledTimes(1);
  });

  test("requests should emit one structured wide event without secrets", async () => {
    const logs = spyRequestLogs();

    const res = await app.request(
      "/trpc/healthCheck?x-clanker-api-key=secret-query-value",
      {
        headers: {
          authorization: "Bearer secret-token",
          "cf-connecting-ip": "203.0.113.24",
          "cf-ray": "test-ray",
          cookie: "better-auth.session_token=secret-cookie",
          origin: "https://clankeroverflow.com",
          "user-agent": "vitest",
          "x-request-id": "request-123",
        },
      },
      mockWorkerEnv,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("request-123");
    expect(logs.info).toHaveBeenCalledTimes(1);
    expect(logs.error).not.toHaveBeenCalled();

    const event = parseLog(logs.info.mock.calls[0]);
    expect(event).toMatchObject({
      event: "api_request",
      message: "GET /trpc/healthCheck completed with 200 (success)",
      service: "server",
      runtime: "cloudflare-workers",
      deployment_environment: "test",
      service_version: "test-version",
      commit_sha: "test-commit",
      request_id: "request-123",
      method: "GET",
      path: "/trpc/healthCheck",
      route_family: "trpc",
      origin: "https://clankeroverflow.com",
      user_agent: "vitest",
      cf_ray: "test-ray",
      request_identity: "ip:203.0.113.24",
      outcome: "success",
      status_code: 200,
    });
    expect(typeof event.timestamp).toBe("string");
    expect(typeof event.duration_ms).toBe("number");

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("secret-query-value");
    expect(serialized).not.toContain("secret-cookie");
    expect(serialized).not.toContain("secret-token");
  });

  test("request failures should emit an error wide event", async () => {
    const logs = spyRequestLogs();
    createDbMock.mockImplementationOnce(async () => {
      throw new Error("db unavailable");
    });

    const res = await app.request("/trpc/healthCheck", undefined, mockWorkerEnv);

    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(logs.info).not.toHaveBeenCalled();
    expect(logs.error).toHaveBeenCalledTimes(1);

    const event = parseLog(logs.error.mock.calls[0]);
    expect(event).toMatchObject({
      event: "api_request",
      message: "GET /trpc/healthCheck completed with 500 (error)",
      service: "server",
      method: "GET",
      path: "/trpc/healthCheck",
      outcome: "error",
      status_code: 500,
      error_type: "Error",
      error_message: "db unavailable",
    });
  });

  test("uncaught request errors should be captured with PostHog", async () => {
    posthogInstances.length = 0;
    createDbMock.mockImplementationOnce(async () => {
      throw new Error("db unavailable");
    });

    const res = await app.request("/trpc/healthCheck", undefined, mockWorkerEnv);

    expect(res.status).toBe(500);
    expect(posthogInstances).toHaveLength(1);
    expect(posthogInstances[0].captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(posthogInstances[0].shutdown).toHaveBeenCalledTimes(1);
  });

  test("GET /auth/ok should serve Better Auth from the custom auth path", async () => {
    const res = await app.request("/auth/ok", undefined, mockWorkerEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Pragma")).toBe("no-cache");
  });

  test("POST /trpc/solutions.log should reject cookie-authenticated mutations from untrusted origins", async () => {
    const res = await app.request(
      "/trpc/solutions.log",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=csrf-test",
          origin: "https://evil.example.com",
        },
        body: JSON.stringify({
          json: {
            problem: "Cross-site request",
            solution: "Should be blocked before it reaches the procedure",
          },
        }),
      },
      mockWorkerEnv,
    );

    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Forbidden");
  });

  describe("CORS", () => {
    test("OPTIONS / should return CORS headers for the www domain", async () => {
      const res = await app.request(
        "/",
        {
          method: "OPTIONS",
          headers: {
            Origin: "https://www.clankeroverflow.com",
            "Access-Control-Request-Method": "GET",
          },
        },
        mockWorkerEnv,
      );
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://www.clankeroverflow.com",
      );
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,OPTIONS");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("GET / should return CORS headers for the apex domain", async () => {
      const res = await app.request(
        "/",
        {
          headers: {
            Origin: "https://clankeroverflow.com",
          },
        },
        mockWorkerEnv,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://clankeroverflow.com");
    });

    test("uncaught /trpc errors should still return CORS and no-store headers", async () => {
      createDbMock.mockImplementationOnce(async () => {
        throw new Error("db unavailable");
      });

      const res = await app.request(
        "/trpc/healthCheck",
        {
          headers: {
            Origin: "https://www.clankeroverflow.com",
          },
        },
        mockWorkerEnv,
      );

      expect(res.status).toBe(500);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://www.clankeroverflow.com",
      );
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Pragma")).toBe("no-cache");
    });

    test("local dev: empty CORS_ORIGIN binding still reflects localhost:3001 when BETTER_AUTH_URL is local", async () => {
      const envWithoutCors = {
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "test_secret",
        GITHUB_CLIENT_ID: "test-github-client-id",
        GITHUB_CLIENT_SECRET: "test-github-client-secret",
      };

      const res = await app.request(
        "/",
        {
          headers: {
            Origin: "http://localhost:3001",
          },
        },
        envWithoutCors,
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
    });
  });

  describe("tRPC", () => {
    test("GET /trpc/healthCheck should return OK", async () => {
      const res = await app.request("/trpc/healthCheck", undefined, mockWorkerEnv);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { result: { data: string } };
      expect(data).toHaveProperty("result");
      expect(data.result.data).toBe("OK");
    });
  });
});
