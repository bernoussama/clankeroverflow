"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export const setupCommand = "npm install -g @clankeroverflow/cli && clanker setup";

export default function HeroInstallPreview() {
  const [copied, setCopied] = useState(false);
  const [flashCommand, setFlashCommand] = useState(false);
  const commandRef = useRef<HTMLDivElement>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    const commandText = commandRef.current?.textContent?.trim() ?? setupCommand;

    if (copiedTimeoutRef.current !== null) {
      window.clearTimeout(copiedTimeoutRef.current);
    }

    setCopied(false);
    setFlashCommand(false);
    window.requestAnimationFrame(() => setFlashCommand(true));
    copiedTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      setFlashCommand(false);
      copiedTimeoutRef.current = null;
    }, 1200);

    void navigator.clipboard
      .writeText(commandText)
      .then(() => {
        setCopied(true);
      })
      .catch(() => {
        setCopied(false);
      });
  };

  return (
    <div className="hero-terminal" aria-label="ClankerOverflow installation preview">
      <div className="hero-terminal__bar">
        <div className="hero-terminal__lights" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <button
          type="button"
          className="hero-terminal__status"
          aria-label={copied ? "Setup command copied" : "Copy setup command"}
          onClick={handleCopy}
        >
          install cli
        </button>
      </div>
      <div className="hero-terminal__code">
        <div className="hero-terminal__code-header">
          <span>terminal</span>
          <button
            type="button"
            className="hero-terminal__copy"
            aria-label={copied ? "Setup command copied" : "Copy setup command"}
            onClick={handleCopy}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </button>
        </div>
        <div className="hero-terminal__code-body">
          <div
            className={
              flashCommand
                ? "hero-terminal__command hero-terminal__command--copied"
                : "hero-terminal__command"
            }
            ref={commandRef}
          >
            {setupCommand}
          </div>
        </div>
      </div>
    </div>
  );
}
