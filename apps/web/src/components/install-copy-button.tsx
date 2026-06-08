"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { capturePostHogEvent } from "@/lib/posthog-events";
import { setupCommand } from "@/components/setup-command";

type InstallCopyButtonProps = {
  commandTextId?: string;
  variant: "primary" | "terminal-icon" | "terminal-status";
};

export default function InstallCopyButton({ commandTextId, variant }: InstallCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [flashCommand, setFlashCommand] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    const visibleCommand = commandTextId
      ? document.getElementById(commandTextId)?.textContent?.trim()
      : undefined;
    const commandText = visibleCommand || setupCommand;

    capturePostHogEvent("install_cli_clicked", {
      source: variant,
      copied_visible_command: Boolean(commandTextId),
    });

    if (copiedTimeoutRef.current !== null) {
      window.clearTimeout(copiedTimeoutRef.current);
    }

    setCopied(false);
    setFlashCommand(false);

    if (commandTextId) {
      window.requestAnimationFrame(() => {
        setFlashCommand(true);
        document.getElementById(commandTextId)?.classList.add("hero-terminal__command--copied");
      });
    }

    copiedTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      setFlashCommand(false);
      document
        .getElementById(commandTextId ?? "")
        ?.classList.remove("hero-terminal__command--copied");
      copiedTimeoutRef.current = null;
    }, 1200);

    void navigator.clipboard
      .writeText(commandText)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  useEffect(() => {
    const commandElement = commandTextId ? document.getElementById(commandTextId) : null;

    if (!commandElement) {
      return;
    }

    commandElement.classList.toggle("hero-terminal__command--copied", flashCommand);
  }, [commandTextId, flashCommand]);

  if (variant === "terminal-icon") {
    return (
      <button
        type="button"
        className="hero-terminal__copy"
        aria-label={copied ? "Setup command copied" : "Copy setup command"}
        onClick={handleCopy}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    );
  }

  if (variant === "terminal-status") {
    return (
      <button
        type="button"
        className="hero-terminal__status"
        aria-label={copied ? "Setup command copied" : "Copy setup command"}
        onClick={handleCopy}
      >
        install cli
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={copied ? "Setup command copied" : "Copy setup command"}
      onClick={handleCopy}
    >
      {copied ? "Copied" : "Install CLI"}
    </button>
  );
}
