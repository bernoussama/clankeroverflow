"use client";

import { useState } from "react";
import { Github } from "lucide-react";

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
        onClick={() => copyToClipboard("npm install -g @clankeroverflow/cli", "install")}
        className="font-label-sm text-label-sm px-6 py-2.5 btn-glow transition-transform hover:scale-105 active:scale-95 cursor-pointer min-h-[40px] px-6"
      >
        {copiedCommand === "install" ? "Command copied!" : "Install CLI"}
      </button>
      <a
        href="https://github.com/bernoussama/clankeroverflow"
        target="_blank"
        rel="noopener noreferrer"
        className="font-label-sm text-label-sm text-on-surface border border-outline hover:bg-surface-container-low px-6 py-2.5 rounded-lg transition-colors bg-surface-container-low flex items-center gap-2 justify-center min-h-[40px] px-6"
      >
        <Github className="w-[18px] h-[18px]" />
        Star on GitHub
      </a>
    </div>
  );
}
