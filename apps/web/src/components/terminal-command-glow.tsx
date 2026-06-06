"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps the terminal command text and listens for the "cli-install-clicked"
 * custom event from HeroButtons. When triggered, the text color animates.
 */
export default function TerminalCommandGlow({ children }: { children: React.ReactNode }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerGlow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setActive(false);
    window.requestAnimationFrame(() => {
      setActive(true);
      timerRef.current = setTimeout(() => {
        setActive(false);
      }, 2000);
    });
  }, []);

  useEffect(() => {
    const handler = () => {
      triggerGlow();
    };
    window.addEventListener("cli-install-clicked", handler);
    return () => {
      window.removeEventListener("cli-install-clicked", handler);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [triggerGlow]);

  return (
    <span
      ref={spanRef}
      className={
        active
          ? "animate-[gradient-shift_2s_ease_forwards] bg-[linear-gradient(90deg,var(--theme-on-primary-fixed-variant),var(--theme-primary-container),var(--theme-primary-fixed-dim),var(--landing-accent),var(--theme-on-primary-fixed-variant))] bg-[length:200%_200%] bg-clip-text text-transparent"
          : "text-primary transition-colors"
      }
      data-terminal-command
    >
      {children}
    </span>
  );
}
