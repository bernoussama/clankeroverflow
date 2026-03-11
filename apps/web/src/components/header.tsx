"use client";
import Link from "next/link";
import { Terminal } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  return (
    <header className="landing-header">
      <div className="flex items-center justify-between px-6 py-3 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-display font-bold text-base tracking-tight hover:opacity-80 transition-opacity"
          >
            <Terminal className="w-4 h-4 text-accent-landing" aria-hidden="true" />
            <span>ClankerOverflow</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map(({ to, label }) => (
              <Link
                key={to}
                href={to}
                className="px-3 py-1.5 text-xs font-mono tracking-wide uppercase hover:text-accent-landing rounded-sm transition-colors"
                style={{ color: "var(--landing-muted)" }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
