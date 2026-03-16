"use client";
import Link from "next/link";
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6"
              aria-hidden="true"
            >
              <path d="M12 19H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="7" y1="17" x2="1" y2="17" stroke="#F97316" strokeWidth="2" strokeLinecap="round" />
              <line x1="7.50266" y1="14.7777" x2="1.70711" y2="13.2247" stroke="#F97316" strokeWidth="2" strokeLinecap="round" />
              <line x1="7.96068" y1="12.4009" x2="2.76453" y2="9.40086" stroke="#F97316" strokeWidth="2" strokeLinecap="round" />
              <line x1="9.56853" y1="10.3971" x2="5.08332" y2="6.41176" stroke="#F97316" strokeWidth="2" strokeLinecap="round" />
            </svg>
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
