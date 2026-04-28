import { PostHog } from "posthog-node";

export type PostHogEnv = {
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
};

export type PostHogClient = Pick<PostHog, "capture" | "captureException" | "identify" | "shutdown">;

/**
 * Creates a request-scoped PostHog client, or null if POSTHOG_API_KEY is not configured.
 * Cloudflare Workers should not rely on process-wide batching.
 */
export function createPostHog(bindings?: PostHogEnv): PostHogClient | null {
  const apiKey = bindings?.POSTHOG_API_KEY?.trim();
  if (!apiKey) return null;

  const host = bindings?.POSTHOG_HOST?.trim() || undefined;

  return new PostHog(apiKey, {
    host,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: false,
  });
}

export async function shutdownPostHog(
  posthog: PostHogClient | null | undefined,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  if (!posthog) return;

  const shutdown = Promise.resolve(posthog.shutdown(5_000) as unknown).catch((err) => {
    console.error("PostHog shutdown failed:", err);
  });

  if (waitUntil) {
    waitUntil(shutdown);
    return;
  }

  await shutdown;
}
