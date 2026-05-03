"use client";

import { useEffect, useState } from "react";
import { Github } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (session) {
      router.replace("/dashboard");
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

    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: `${appOrigin}/onboarding`,
        errorCallbackURL: `${appOrigin}/login`,
      });
    } catch (error) {
      setIsSigningIn(false);
      toast.error(error instanceof Error ? error.message : "Unable to start GitHub sign in");
    }
  }

  return (
    <div className="page-shell">
      <div className="auth-card fade-in-up text-center">
        <h1 className="page-title text-2xl mb-1">Sign In</h1>
        <p className="text-sm text-muted-landing mb-6">
          Use your GitHub account to access the dashboard.
        </p>

        <button
          type="button"
          onClick={handleGitHubSignIn}
          className="btn-primary w-full justify-center"
          disabled={isSigningIn}
        >
          <Github className="h-4 w-4" aria-hidden="true" />
          {isSigningIn ? "Redirecting to GitHub..." : "Continue with GitHub"}
        </button>
      </div>
    </div>
  );
}
