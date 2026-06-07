"use client";

import { useEffect, useRef, useState } from "react";

import { setupCommand } from "@/components/hero-install-preview";

export default function HeroInstallButton() {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    if (copiedTimeoutRef.current !== null) {
      window.clearTimeout(copiedTimeoutRef.current);
    }

    void navigator.clipboard
      .writeText(setupCommand)
      .then(() => {
        setCopied(true);
        copiedTimeoutRef.current = window.setTimeout(() => {
          setCopied(false);
          copiedTimeoutRef.current = null;
        }, 1200);
      })
      .catch(() => {
        setCopied(false);
      });
  };

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
