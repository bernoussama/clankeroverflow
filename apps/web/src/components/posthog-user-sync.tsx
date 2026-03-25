"use client";

import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { getPosthog, trackEvent } from "@/lib/analytics";

const SIGNED_IN_USER_KEY = "clankeroverflow_analytics_signed_in_user_id";

export default function PosthogUserSync() {
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    const ph = getPosthog();
    if (!ph || isPending) return;

    if (session?.user) {
      ph.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
      });
      if (typeof sessionStorage !== "undefined") {
        const last = sessionStorage.getItem(SIGNED_IN_USER_KEY);
        if (last !== session.user.id) {
          sessionStorage.setItem(SIGNED_IN_USER_KEY, session.user.id);
          trackEvent("signed_in", { provider: "github" });
        }
      }
    } else {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(SIGNED_IN_USER_KEY);
      }
      ph.reset();
    }
  }, [session, isPending]);

  return null;
}
