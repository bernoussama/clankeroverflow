"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { env } from "@clankeroverflow/env/web";
import type { PostHog } from "posthog-js";

import { posthogApiHost, setPosthogClient } from "@/lib/analytics";

declare global {
  interface Window {
    __clankeroverflowPosthog?: PostHog;
  }
}

function attachClient(instance: PostHog) {
  window.__clankeroverflowPosthog = instance;
  setPosthogClient(instance);
}

export default function PosthogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [posthog, setPosthog] = useState<PostHog | null>(() =>
    typeof window !== "undefined" ? (window.__clankeroverflowPosthog ?? null) : null,
  );

  useEffect(() => {
    const key = env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || typeof window === "undefined") return;

    const existing = window.__clankeroverflowPosthog;
    if (existing) {
      attachClient(existing);
      setPosthog(existing);
      return;
    }

    void import("posthog-js").then(({ default: ph }) => {
      if (window.__clankeroverflowPosthog) {
        const ready = window.__clankeroverflowPosthog;
        attachClient(ready);
        setPosthog(ready);
        return;
      }

      const instance = ph.init(key, {
        api_host: posthogApiHost(),
        person_profiles: "identified_only",
        capture_pageview: false,
      });
      attachClient(instance);
      setPosthog(instance);
    });
  }, []);

  useEffect(() => {
    if (!posthog || !pathname) return;
    posthog.capture("$pageview", {
      $current_url: window.location.href,
    });
  }, [posthog, pathname]);

  return <>{children}</>;
}
