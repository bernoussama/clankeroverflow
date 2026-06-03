"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, X } from "lucide-react";
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
      <div className="page-container max-w-2xl">
        <div className="dashboard-card fade-in-up">
          <div className="dashboard-card__header">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-accent-landing" aria-hidden="true" />
              <h1 className="font-display text-xl font-bold tracking-tight">
                Authorize ClankerOverflow CLI
              </h1>
            </div>
            <p className="text-sm text-muted-landing">
              Allow the setup command to create an API key for your local agent configuration.
            </p>
          </div>
          <div className="dashboard-card__body space-y-5">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-landing mb-2">
                Verification code
              </p>
              <code className="block break-all text-lg font-mono px-4 py-3 rounded-none bg-background border border-landing text-foreground">
                {userCode || "Missing code"}
              </code>
            </div>

            {status === "invalid" ? (
              <p className="text-sm text-muted-landing">
                This CLI authorization request is invalid or expired. Run setup again to generate a
                fresh link.
              </p>
            ) : finished ? (
              <p className="text-sm text-muted-landing">
                {status === "approved"
                  ? "Approved. You can return to your terminal."
                  : "Denied. You can close this tab."}
              </p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="btn-primary justify-center"
                  onClick={approve}
                  disabled={isProcessing}
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  {isProcessing ? "Authorizing..." : "Authorize CLI"}
                </button>
                <button
                  type="button"
                  className="btn-secondary justify-center"
                  onClick={deny}
                  disabled={isProcessing}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  Deny
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
