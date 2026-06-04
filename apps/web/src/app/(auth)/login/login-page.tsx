"use client";

import { useEffect, useState } from "react";
import { Github } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";

function getSafeCallbackURL() {
  if (typeof window === "undefined") return "/dashboard";
  const params = new URLSearchParams(window.location.search);
  const requested =
    params.get("callbackURL") ?? params.get("callbackUrl") ?? params.get("redirectTo");
  return requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (session) {
      const callbackURL = getSafeCallbackURL();
      router.replace(callbackURL as Route);
    }
  }, [router, session]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error") ?? params.get("error_description");

    if (!oauthError) {
      return;
    }

    toast.error(oauthError.replaceAll("_", " "));
  }, []);

  if (isPending || session) {
    return <Loader />;
  }

  async function handleGitHubSignIn() {
    setIsSigningIn(true);
    const appOrigin = window.location.origin;
    const callbackURL = getSafeCallbackURL();
    const callbackTarget = `${appOrigin}${callbackURL}`;
    const loginErrorTarget = `${appOrigin}/login?callbackURL=${encodeURIComponent(callbackURL)}`;

    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: callbackTarget,
        newUserCallbackURL: callbackTarget,
        errorCallbackURL: loginErrorTarget,
      });
    } catch (error) {
      setIsSigningIn(false);
      toast.error(error instanceof Error ? error.message : "Unable to start GitHub sign in");
    }
  }

  return (
    <div className="page-shell">
      <div className="auth-card fade-in-up text-center border-2 border-landing p-8 md:p-10 flex flex-col gap-6 relative overflow-hidden bg-surface-card">
        {/* Top decorative header status bar */}
        <div className="flex items-center justify-between border-b border-landing pb-4 w-full">
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase text-muted-landing">
            <span className="inline-block w-1.5 h-1.5 bg-[var(--landing-accent)] animate-pulse rounded-full" />
            SECURE GATEWAY
          </div>
          <div className="flex gap-1" aria-hidden="true">
            <span className="w-1.5 h-1.5 bg-border rounded-full" />
            <span className="w-1.5 h-1.5 bg-border rounded-full" />
            <span className="w-1.5 h-1.5 bg-border rounded-full" />
          </div>
        </div>

        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-on-surface mb-2">
            Sign In
          </h1>
          <p className="text-xs text-muted-landing font-mono max-w-[280px] mx-auto leading-relaxed">
            Use your GitHub account to access the dashboard.
          </p>
        </div>

        {/* Central decorative gateway box */}
        <div className="py-2 flex justify-center w-full">
          <div className="relative p-6 bg-surface-landing border border-landing rounded-none shadow-[4px_4px_0_0_var(--border)] hover:shadow-[4px_4px_0_0_var(--landing-accent)] transition-all">
            <Github className="w-12 h-12 text-landing-accent" />
            <div className="absolute -bottom-2 -right-2 bg-background border border-landing px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-landing">
              GATE_WAY
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGitHubSignIn}
          className="btn-primary w-full justify-center py-3 text-sm uppercase tracking-wider font-bold transition-all hover:bg-[var(--landing-accent)] flex items-center gap-2 group cursor-pointer"
          disabled={isSigningIn}
        >
          <Github className="h-4 w-4 transition-transform group-hover:scale-110" aria-hidden="true" />
          {isSigningIn ? "Redirecting to GitHub..." : "Continue with GitHub"}
        </button>

        {/* Bottom security footer note */}
        <div className="border-t border-landing pt-4 w-full mt-2">
          <p className="text-[10px] text-muted-landing font-mono leading-relaxed">
            By continuing, you authorize ClankerOverflow to manage secure API keys for agent configurations.
          </p>
        </div>
      </div>
    </div>
  );
}

