"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, KeyRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";

type DeviceStatus = "idle" | "valid" | "approved" | "denied" | "invalid";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to process device authorization";
}

function getUserCodeFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("user_code") ?? "";
}

export default function CliAuthPage() {
  const router = useRouter();
  const [userCode, setUserCode] = useState("");
  const [hasReadUserCode, setHasReadUserCode] = useState(false);
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [status, setStatus] = useState<DeviceStatus>("idle");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setUserCode(getUserCodeFromLocation());
    setHasReadUserCode(true);
  }, []);

  useEffect(() => {
    if (isSessionPending || !hasReadUserCode) return;

    if (!session) {
      const next = `/cli-auth${userCode ? `?user_code=${encodeURIComponent(userCode)}` : ""}`;
      router.replace(`/login?callbackURL=${encodeURIComponent(next)}`);
      return;
    }

    if (!userCode) {
      setStatus("invalid");
      return;
    }

    let cancelled = false;
    void authClient
      .device({
        query: {
          user_code: userCode,
        },
      })
      .then((data) => {
        if (cancelled) return;
        if (!data || data.status !== "pending") {
          setStatus("invalid");
          return;
        }
        setStatus("valid");
      })
      .catch(() => {
        if (!cancelled) setStatus("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [hasReadUserCode, isSessionPending, router, session, userCode]);

  async function approve() {
    setIsProcessing(true);
    try {
      await authClient.device.approve({
        userCode,
      });
      setStatus("approved");
      toast.success("CLI authorized");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  }

  async function deny() {
    setIsProcessing(true);
    try {
      await authClient.device.deny({
        userCode,
      });
      setStatus("denied");
      toast.info("CLI authorization denied");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  }

  if (!hasReadUserCode || isSessionPending || !session || status === "idle") {
    return <Loader />;
  }

  const finished = status === "approved" || status === "denied";

  return (
    <div className="page-shell">
      <div className="auth-card auth-card--centered fade-in-up">
        <div>
          <KeyRound className="w-10 h-10 text-accent-landing mx-auto mb-3" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Authorize ClankerOverflow CLI
          </h1>
          <p className="text-sm text-muted-landing mt-2">
            Allow the setup command to create an API key for your local agent configuration.
          </p>
        </div>

        <div className="w-full">
          {status === "invalid" ? (
            <div className="auth-status-feedback">
              <AlertCircle className="w-10 h-10 text-destructive" aria-hidden="true" />
              <p className="auth-status-feedback__text">
                This CLI authorization request is invalid or expired. Run setup again to generate a
                fresh link.
              </p>
            </div>
          ) : finished ? (
            <div className="auth-status-feedback">
              <div
                className={`auth-status-feedback__icon ${
                  status === "approved"
                    ? "auth-status-feedback__icon--success"
                    : "auth-status-feedback__icon--error"
                }`}
              >
                {status === "approved" ? (
                  <Check className="w-6 h-6" aria-hidden="true" />
                ) : (
                  <X className="w-6 h-6" aria-hidden="true" />
                )}
              </div>
              <p className="auth-status-feedback__text">
                {status === "approved"
                  ? "Approved. You can return to your terminal."
                  : "Denied. You can close this tab."}
              </p>
            </div>
          ) : (
            <div className="verification-code">
              <p className="verification-code__label">Verification code</p>
              <code className="verification-code__display">{userCode || "Missing code"}</code>

              <div className="auth-actions" style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={approve}
                  disabled={isProcessing}
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  {isProcessing ? "Authorizing..." : "Authorize"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={deny}
                  disabled={isProcessing}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  Deny
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
