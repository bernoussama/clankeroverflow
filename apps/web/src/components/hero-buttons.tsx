"use client";

import { useState } from "react";
import { Github } from "lucide-react";
import { landingPrimaryButton, landingSecondaryButton } from "./landing-ui";

export default function HeroButtons() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedCommand(id);
        setTimeout(() => setCopiedCommand(null), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="flex flex-wrap justify-center gap-4">
      <button
        onClick={() => {
          copyToClipboard("npm install -g @clankeroverflow/cli && clanker setup", "install");
          window.dispatchEvent(new CustomEvent("cli-install-clicked"));
        }}
        className={`${landingPrimaryButton} min-w-36 select-none px-6`}
        data-glow-button
      >
        <span className="relative z-10">
          {copiedCommand === "install" ? "Command copied!" : "Install CLI"}
        </span>
      </button>
      <a
        href="https://github.com/bernoussama/clankeroverflow"
        target="_blank"
        rel="noopener noreferrer"
        className={`${landingSecondaryButton} select-none px-6`}
      >
        <Github className="w-[18px] h-[18px]" />
        Star on GitHub
      </a>
    </div>
  );
}
