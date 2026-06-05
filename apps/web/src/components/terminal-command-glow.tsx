"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Wraps the terminal command text and listens for the "cli-install-clicked"
 * custom event from HeroButtons. When triggered, the text color animates
 * with the same gradient shift used by the .btn-glow border.
 */
export default function TerminalCommandGlow({
  children,
}: {
  children: React.ReactNode;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);

  const triggerGlow = useCallback(() => {
    const el = spanRef.current;
    if (!el) return;

    // Restart the animation by removing and re-adding the class
    el.classList.remove("glow-active");
    // Force reflow so the browser recognises the removal
    void el.offsetWidth;
    el.classList.add("glow-active");

    // Remove the class after the animation completes (2s)
    const timer = setTimeout(() => {
      el.classList.remove("glow-active");
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handler = () => {
      triggerGlow();
    };
    window.addEventListener("cli-install-clicked", handler);
    return () => window.removeEventListener("cli-install-clicked", handler);
  }, [triggerGlow]);

  return (
    <span ref={spanRef} className="terminal-cmd-glow">
      {children}
    </span>
  );
}
