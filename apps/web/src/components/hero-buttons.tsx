"use client";

import { useState, useEffect, useRef } from "react";
import { Github } from "lucide-react";

export default function HeroButtons() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    let rafId: number;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;

        const glowEls = container.querySelectorAll<HTMLElement>(".btn-glow");
        glowEls.forEach((el) => {
          el.classList.add("mouse-moving");
          const rect = el.getBoundingClientRect();
          const pctX = ((e.clientX - rect.left) / rect.width) * 100;
          const pctY = ((e.clientY - rect.top) / rect.height) * 100;
          el.style.setProperty("--mouse-pct-x", `${pctX}%`);
          el.style.setProperty("--mouse-pct-y", `${pctY}%`);
        });
      });
    };

    const handleMouseLeave = () => {
      const container = containerRef.current;
      if (!container) return;
      const glowEls = container.querySelectorAll<HTMLElement>(".btn-glow");
      glowEls.forEach((el) => {
        el.classList.remove("mouse-moving");
        el.style.setProperty("--mouse-pct-x", "50%");
        el.style.setProperty("--mouse-pct-y", "50%");
      });
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Show glow effect whenever button is visible in the viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const glowEls = container.querySelectorAll<HTMLElement>(".btn-glow");
    if (glowEls.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
          } else {
            entry.target.classList.remove("in-view");
          }
        });
      },
      { threshold: 0 }
    );

    glowEls.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-wrap justify-center gap-4">
      <button
        onClick={() => {
          copyToClipboard("npm install -g @clankeroverflow/cli", "install");
          window.dispatchEvent(new CustomEvent("cli-install-clicked"));
        }}
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
        className="font-label-sm text-label-sm text-on-surface hover:text-landing-accent border border-outline hover:bg-surface-container-low px-6 py-2.5 rounded-lg transition-colors bg-surface-container-low flex items-center gap-2 justify-center min-h-[40px] select-none cursor-pointer"
      >
        <Github className="w-[18px] h-[18px]" />
        Star on GitHub
      </a>
    </div>
  );
}

