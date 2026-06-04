"use client";

import { useState, useEffect, useRef } from "react";
import { Github } from "lucide-react";

export default function HeroButtons() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedCommand(id);
        setTimeout(() => setCopiedCommand(null), 2000);
      })
      .catch(() => {});
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const el = buttonRef.current;
      if (!el) return;

      el.classList.add("mouse-moving");

      const rect = el.getBoundingClientRect();
      const pctX = ((e.clientX - rect.left) / rect.width) * 100;
      el.style.setProperty("--mouse-pct-x", `${pctX}%`);

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        el.classList.remove("mouse-moving");
      }, 1500);
    };

    const handleMouseLeave = () => {
      const el = buttonRef.current;
      if (!el) return;
      el.classList.remove("mouse-moving");
      el.style.setProperty("--mouse-pct-x", `50%`);
      clearTimeout(timeoutId);
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="flex flex-wrap justify-center gap-4">
      <button
        ref={buttonRef}
        onClick={() => copyToClipboard("npm install -g @clankeroverflow/cli", "install")}
        className="font-label-sm text-label-sm px-6 py-2.5 btn-glow transition-transform hover:scale-105 active:scale-95 cursor-pointer min-h-[40px] select-none"
      >
        <span className="relative z-10">
          {copiedCommand === "install" ? "Command copied!" : "Install CLI"}
        </span>
      </button>
      <a
        href="https://github.com/bernoussama/clankeroverflow"
        target="_blank"
        rel="noopener noreferrer"
        className="font-label-sm text-label-sm text-on-surface hover:text-landing-accent border border-outline hover:bg-surface-container-low px-6 py-2.5 rounded-lg transition-colors bg-surface-container-low flex items-center gap-2 justify-center min-h-[40px] px-6 select-none cursor-pointer"
      >
        <Github className="w-[18px] h-[18px]" />
        Star on GitHub
      </a>
    </div>
  );
}
