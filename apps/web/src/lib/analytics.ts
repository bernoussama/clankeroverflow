import { env } from "@clankeroverflow/env/web";
import type { PostHog } from "posthog-js";

const US_INGEST = "https://us.i.posthog.com";

let client: PostHog | null = null;

export function setPosthogClient(instance: PostHog | null) {
  client = instance;
}

export function getPosthog(): PostHog | null {
  return client;
}

export function posthogApiHost(): string {
  return env.NEXT_PUBLIC_POSTHOG_HOST ?? US_INGEST;
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!client) return;
  client.capture(event, properties);
}

export function resetPosthog() {
  client?.reset();
}
