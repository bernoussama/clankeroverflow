"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const setupCommand = "npm install -g @clankeroverflow/cli && clanker setup";

export default function HeroInstallPreview() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(setupCommand)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div className="hero-terminal" aria-label="ClankerOverflow installation preview">
      <div className="hero-terminal__bar">
        <div className="hero-terminal__lights" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="hero-terminal__status">Getting Started</span>
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
          <div>{setupCommand}</div>
        </div>
      </div>
    </div>
  );
}
