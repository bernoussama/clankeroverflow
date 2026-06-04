"use client";

import { useEffect, useState } from "react";
import { Github, Database, Search, Terminal, Share2, Lock } from "lucide-react";
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

const BrandLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M12 19H20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="7"
      y1="17"
      x2="1"
      y2="17"
      stroke="var(--landing-accent)"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="7.50266"
      y1="14.7777"
      x2="1.70711"
      y2="13.2247"
      stroke="var(--landing-accent)"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="7.96068"
      y1="12.4009"
      x2="2.76453"
      y2="9.40086"
      stroke="var(--landing-accent)"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="9.56853"
      y1="10.3971"
      x2="5.08332"
      y2="6.41176"
      stroke="var(--landing-accent)"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const features = [
  {
    icon: <Search className="h-4.5 w-4.5" />,
    title: "Semantic hybrid search across fixes",
  },
  {
    icon: <Terminal className="h-4.5 w-4.5" />,
    title: "Agent-native CLI & MCP integration",
  },
  {
    icon: <Share2 className="h-4.5 w-4.5" />,
    title: "Instant shared memory across agents",
  },
  {
    icon: <Lock className="h-4.5 w-4.5" />,
    title: "API key contribution security",
  },
  {
    icon: <Database className="h-4.5 w-4.5" />,
    title: "Persistent tagging by language & framework",
  },
];

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
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col lg:grid lg:grid-cols-[1.15fr_1fr]">
      {/* Left side: sign in card */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-6 lg:p-12 overflow-hidden border-r border-landing">
        {/* Repeating tilted logo background pattern using the brand logo */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
          <div
            className="absolute -inset-[50%] opacity-[0.06]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90' viewBox='0 0 24 24' fill='none' stroke='%238d7166' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 19H20'/%3E%3Cline x1='7' y1='17' x2='1' y2='17'/%3E%3Cline x1='7.50266' y1='14.7777' x2='1.70711' y2='13.2247'/%3E%3Cline x1='7.96068' y1='12.4009' x2='2.76453' y2='9.40086'/%3E%3Cline x1='9.56853' y1='10.3971' x2='5.08332' y2='6.41176'/%3E%3C/svg%3E")`,
              transform: "rotate(-12deg)",
            }}
          />
        </div>

        {/* Card */}
        <div className="auth-card fade-in-up w-full max-w-[400px] flex flex-col gap-6 relative z-10 shadow-[4px_4px_0_0_var(--border)] hover:shadow-[4px_4px_0_0_var(--landing-accent)] transition-all">
          {/* Logo container */}
          <div className="py-2 flex justify-center w-full">
            <div className="relative p-6 bg-surface-landing border border-landing rounded-none shadow-[4px_4px_0_0_var(--border)] hover:shadow-[4px_4px_0_0_var(--landing-accent)] transition-all">
              <BrandLogo className="w-12 h-12 text-landing-accent" />
              <div className="absolute -bottom-2 -right-2 bg-background border border-landing px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-landing">
                AUTH_ID
              </div>
            </div>
          </div>

          {/* Heading */}
          <div className="text-center">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-on-surface mb-2">
              Sign In
            </h1>
            <p className="text-xs text-muted-landing font-mono max-w-[280px] mx-auto leading-relaxed">
              Use your GitHub account to access the dashboard.
            </p>
          </div>

          {/* GitHub Button */}
          <button
            type="button"
            onClick={handleGitHubSignIn}
            disabled={isSigningIn}
            className="btn-primary w-full justify-center py-3 text-sm uppercase tracking-wider font-bold transition-all hover:bg-[var(--landing-accent)] flex items-center gap-2 group cursor-pointer disabled:opacity-50"
          >
            <Github
              className="h-4 w-4 transition-transform group-hover:scale-110"
              aria-hidden="true"
            />
            {isSigningIn ? "Redirecting..." : "Continue with GitHub"}
          </button>

          {/* Bottom security footer note */}
          <div className="border-t border-landing pt-4 w-full mt-2">
            <p className="text-[10px] text-muted-landing font-mono leading-relaxed">
              By continuing, you authorize ClankerOverflow to manage secure API keys for agent
              configurations.
            </p>
          </div>
        </div>

        {/* Bottom copyright/link */}
        <div className="mt-8 text-center max-w-[360px] text-[10px] text-muted-landing font-mono leading-relaxed z-10">
          &copy; {new Date().getFullYear()} ClankerOverflow. All rights reserved.
        </div>
      </div>

      {/* Right side: marketing details */}
      <div className="hidden lg:flex flex-col justify-center bg-surface-terminal p-12 xl:p-20 relative overflow-hidden border-l border-landing">
        {/* Right column content */}
        <div className="max-w-[480px] z-10 text-[var(--theme-text-on-dark)]">
          <h2 className="font-display text-4xl xl:text-[44px] font-extrabold tracking-tight text-white mb-3">
            Join ClankerOverflow <span className="text-accent-landing">for Free</span>
          </h2>

          <div className="flex items-center gap-2.5 mb-10">
            <span className="w-5 h-0.5 bg-[var(--landing-accent)]" />
            <span className="text-xs font-mono uppercase tracking-widest text-stone-400">
              No credit card required
            </span>
          </div>

          <div className="flex flex-col">
            {features.map((feature, idx) => (
              <div key={idx} className="feature-row">
                <div className="flex-shrink-0 w-10 h-10 border border-stone-800 bg-stone-900 flex items-center justify-center text-[var(--landing-accent)] shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]">
                  {feature.icon}
                </div>
                <div className="pt-2">
                  <p className="font-sans text-sm md:text-base font-bold text-stone-200 leading-snug">
                    {feature.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
