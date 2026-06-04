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

export default function CliAuthClient() {
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
      <div className="auth-card fade-in-up border-2 border-landing p-8 md:p-10 flex flex-col gap-6 relative overflow-hidden bg-surface-card text-center">
        {/* Top decorative terminal header bar */}
        <div className="flex items-center justify-between border-b border-landing pb-4 w-full">
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase text-muted-landing">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                status === "valid"
                  ? "bg-amber-500 animate-pulse"
                  : status === "approved"
                    ? "bg-green-500"
                    : "bg-red-500"
              }`}
              aria-hidden="true"
            />
            CLI_AUTH // {status.toUpperCase()}
          </div>
          <div className="flex gap-1" aria-hidden="true">
            <span className="w-1.5 h-1.5 bg-border rounded-full" />
            <span className="w-1.5 h-1.5 bg-border rounded-full" />
            <span className="w-1.5 h-1.5 bg-border rounded-full" />
          </div>
        </div>

        <div>
          <KeyRound className="w-12 h-12 text-landing-accent mx-auto mb-3" aria-hidden="true" />
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-on-surface">
            Authorize CLI Setup
          </h1>
          <p className="text-xs text-muted-landing font-mono mt-1 max-w-[280px] mx-auto leading-relaxed">
            Allow the setup command to configure an API key for your local agent environment.
          </p>
        </div>

        <div className="w-full">
          {status === "invalid" ? (
            <div className="auth-status-feedback">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-2" aria-hidden="true" />
              <p className="auth-status-feedback__text text-xs text-muted-landing font-mono leading-relaxed">
                This CLI authorization request is invalid or expired. Run setup again to generate a
                fresh link.
              </p>
            </div>
          ) : finished ? (
            <div className="auth-status-feedback">
              <div
                className={`auth-status-feedback__icon mx-auto mb-2 ${
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
              <p className="auth-status-feedback__text text-xs font-semibold font-mono text-on-surface">
                {status === "approved"
                  ? "Approved. You can return to your terminal."
                  : "Denied. You can close this tab."}
              </p>
            </div>
          ) : (
            <div className="verification-code">
              <p className="verification-code__label font-mono text-[10px] text-muted-landing uppercase tracking-widest mb-2">
                Verification code
              </p>
              <code className="verification-code__display block w-full py-4 text-center font-mono text-2xl font-bold tracking-[0.2em] text-indent-[0.2em] bg-[var(--landing-code-bg)] text-[var(--landing-code-fg)] border border-landing rounded-none shadow-inner">
                {userCode || "Missing code"}
              </code>

              <p className="text-[10px] text-muted-landing font-mono text-center leading-relaxed mt-4 max-w-[260px] mx-auto">
                Verify this matches the character sequence printed in your terminal.
              </p>

              <div className="auth-actions" style={{ marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn-primary w-full justify-center py-3 text-xs uppercase tracking-wider font-bold transition-all hover:bg-[var(--landing-accent)] flex items-center gap-1.5 cursor-pointer"
                  onClick={approve}
                  disabled={isProcessing}
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  {isProcessing ? "Authorizing..." : "Authorize"}
                </button>
                <button
                  type="button"
                  className="btn-secondary w-full justify-center py-3 text-xs uppercase tracking-wider font-medium transition-all flex items-center gap-1.5 cursor-pointer"
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
