"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { env } from "@clankeroverflow/env/web";

import { authClient } from "@/lib/auth-client";

declare global {
  interface Window {
    posthog?: {
      identify: (distinctId: string, properties?: Record<string, unknown>) => void;
      reset: () => void;
    };
  }
}

const HOME_ANALYTICS_FALLBACK_DELAY_MS = 12_000;
const ROUTE_ANALYTICS_FALLBACK_DELAY_MS = 2_500;
const userInteractionEvents = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

function getPostHogSnippet(apiKey: string, apiHost: string) {
  return `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(apiKey)},{api_host:${JSON.stringify(apiHost)},defaults:'2026-01-30',autocapture:false,capture_pageview:false,disable_session_recording:true,disable_surveys:true});`;
}

export default function PostHogAnalytics() {
  const apiKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost = env.NEXT_PUBLIC_POSTHOG_HOST;
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const identifiedUserId = useRef<string | null>(null);
  const [shouldLoadAnalytics, setShouldLoadAnalytics] = useState(false);

  useEffect(() => {
    if (!apiKey || !apiHost || typeof window === "undefined") {
      return;
    }

    setShouldLoadAnalytics(false);

    if (pathname !== "/") {
      const requestIdleCallback = window.requestIdleCallback;
      const idleHandle =
        typeof requestIdleCallback === "function"
          ? requestIdleCallback(() => setShouldLoadAnalytics(true))
          : undefined;
      const fallbackTimer = window.setTimeout(
        () => setShouldLoadAnalytics(true),
        ROUTE_ANALYTICS_FALLBACK_DELAY_MS,
      );

      return () => {
        if (idleHandle !== undefined) {
          window.cancelIdleCallback(idleHandle);
        }
        window.clearTimeout(fallbackTimer);
      };
    }

    const loadAnalytics = () => setShouldLoadAnalytics(true);
    const fallbackTimer = window.setTimeout(loadAnalytics, HOME_ANALYTICS_FALLBACK_DELAY_MS);

    for (const eventName of userInteractionEvents) {
      window.addEventListener(eventName, loadAnalytics, { once: true, passive: true });
    }

    return () => {
      window.clearTimeout(fallbackTimer);
      for (const eventName of userInteractionEvents) {
        window.removeEventListener(eventName, loadAnalytics);
      }
    };
  }, [apiHost, apiKey, pathname]);

  useEffect(() => {
    if (!apiKey || isPending || typeof window === "undefined" || !window.posthog) {
      return;
    }

    if (session?.user) {
      window.posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
      });
      identifiedUserId.current = session.user.id;
      return;
    }

    if (identifiedUserId.current) {
      window.posthog.reset();
      identifiedUserId.current = null;
    }
  }, [apiKey, isPending, session?.user]);

  if (!apiKey || !apiHost || !shouldLoadAnalytics) {
    return null;
  }

  return (
    <Script
      id="posthog-browser-analytics"
      strategy="lazyOnload"
      dangerouslySetInnerHTML={{ __html: getPostHogSnippet(apiKey, apiHost) }}
    />
  );
}
