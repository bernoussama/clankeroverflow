"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ModeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.25rem",
              height: "2.25rem",
              border: "1px solid var(--landing-border)",
              borderRadius: "2px",
              background: "transparent",
              cursor: "pointer",
              transition: "border-color 0.15s ease, color 0.15s ease",
              color: "var(--landing-muted)",
              position: "relative",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-accent)";
              e.currentTarget.style.color = "var(--landing-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-border)";
              e.currentTarget.style.color = "var(--landing-muted)";
            }}
          />
        }
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        style={{ borderRadius: "3px", border: "1px solid var(--landing-border)" }}
      >
        <DropdownMenuItem className="font-mono text-xs" onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem className="font-mono text-xs" onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem className="font-mono text-xs" onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
