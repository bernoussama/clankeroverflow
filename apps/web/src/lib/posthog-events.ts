type PostHogEventProperties = Record<string, string | number | boolean | null | undefined>;

type QueuedPostHogEvent = {
  eventName: string;
  properties?: PostHogEventProperties;
};

declare global {
  interface Window {
    clankerPostHogQueue?: QueuedPostHogEvent[];
    posthog?: {
      capture?: (eventName: string, properties?: PostHogEventProperties) => void;
      identify?: (distinctId: string, properties?: Record<string, unknown>) => void;
      reset?: () => void;
    };
  }
}

function getPageProperties() {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    path: window.location.pathname,
    search: window.location.search || undefined,
  };
}

export function capturePostHogEvent(eventName: string, properties?: PostHogEventProperties) {
  if (typeof window === "undefined") {
    return;
  }

  const eventProperties = {
    ...getPageProperties(),
    ...properties,
  };

  if (typeof window.posthog?.capture === "function") {
    window.posthog.capture(eventName, eventProperties);
    return;
  }

  window.clankerPostHogQueue = window.clankerPostHogQueue ?? [];
  window.clankerPostHogQueue.push({ eventName, properties: eventProperties });
}

export function capturePostHogPageview(pathname: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.posthog?.capture?.("$pageview", {
    $current_url: window.location.href,
    path: pathname,
    search: window.location.search || undefined,
  });
}

export function flushQueuedPostHogEvents() {
  if (typeof window === "undefined" || typeof window.posthog?.capture !== "function") {
    return false;
  }

  const queuedEvents = window.clankerPostHogQueue ?? [];
  window.clankerPostHogQueue = [];

  for (const { eventName, properties } of queuedEvents) {
    window.posthog.capture(eventName, properties);
  }

  return true;
}
