"use client";

import { Moon, Sun } from "lucide-react";
import * as React from "react";

import { useTheme } from "@/components/theme-provider";

export function ModeToggle() {
  const { setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);

  const chooseTheme = (theme: "light" | "dark" | "system") => {
    setTheme(theme);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="mode-toggle-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </button>
      {open && (
        <div className="dropdown-content absolute right-0 top-full z-50 mt-2 min-w-32" role="menu">
          <button
            type="button"
            className="block w-full px-2 py-2 text-left font-mono text-xs"
            onClick={() => chooseTheme("light")}
            role="menuitem"
          >
            Light
          </button>
          <button
            type="button"
            className="block w-full px-2 py-2 text-left font-mono text-xs"
            onClick={() => chooseTheme("dark")}
            role="menuitem"
          >
            Dark
          </button>
          <button
            type="button"
            className="block w-full px-2 py-2 text-left font-mono text-xs"
            onClick={() => chooseTheme("system")}
            role="menuitem"
          >
            System
          </button>
        </div>
      )}
    </div>
  );
}
