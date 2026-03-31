"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Github } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isPasskeySigningIn, setIsPasskeySigningIn] = useState(false);
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

  useEffect(() => {
    if (
      typeof PublicKeyCredential === "undefined" ||
      !PublicKeyCredential.isConditionalMediationAvailable ||
      !PublicKeyCredential.isConditionalMediationAvailable()
    ) {
      return;
    }

    void authClient.signIn.passkey({ autoFill: true });
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

  async function handlePasskeySignIn() {
    setIsPasskeySigningIn(true);

    try {
      const result = await authClient.signIn.passkey({
        autoFill: false,
        fetchOptions: {
          onSuccess() {
            router.replace("/dashboard");
          },
        },
      });
      if (result.data) {
        router.replace("/dashboard");
      }
      if (result.error) {
        toast.error(
          typeof result.error.message === "string"
            ? result.error.message
            : "Passkey sign-in was cancelled or failed",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Passkey sign-in failed");
    } finally {
      setIsPasskeySigningIn(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="auth-card fade-in-up text-center">
        <h1 className="page-title text-2xl mb-1">Sign In</h1>
        <p className="text-sm text-muted-landing mb-6">
          Use your GitHub account or a passkey you registered from the dashboard.
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleGitHubSignIn}
            className="btn-primary w-full justify-center"
            disabled={isSigningIn || isPasskeySigningIn}
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            {isSigningIn ? "Redirecting to GitHub..." : "Continue with GitHub"}
          </button>

          <button
            type="button"
            onClick={handlePasskeySignIn}
            className="btn-secondary w-full justify-center"
            disabled={isSigningIn || isPasskeySigningIn}
          >
            <Fingerprint className="h-4 w-4" aria-hidden="true" />
            {isPasskeySigningIn ? "Waiting for passkey…" : "Sign in with passkey"}
          </button>
        </div>
      </div>
    </div>
  );
}
