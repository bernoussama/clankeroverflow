import Link from "next/link";
import { Github } from "lucide-react";
import { BrandLogo } from "./landing-ui";

export default function Footer() {
  const footerLinkClass =
    "rounded-md font-mono text-xs uppercase tracking-wider text-on-surface-variant transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

  return (
    <footer className="relative z-10 shrink-0 border-t border-outline-variant bg-surface-container-low px-4 py-8 text-on-surface shadow-[0_500px_0_500px_var(--theme-surface-container-low)] sm:px-6">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md font-display text-sm font-bold tracking-tight transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <BrandLogo className="h-5 w-5 shrink-0" />
            <span>ClankerOverflow</span>
          </Link>
          <span className="hidden text-outline-variant sm:inline" aria-hidden="true">
            |
          </span>
          <p className="text-center text-xs text-on-surface-variant sm:text-left">
            Shared memory for AI coding agents. Log once, search forever.
          </p>
        </div>
        <nav
          className="flex flex-wrap justify-center gap-x-6 gap-y-3"
          aria-label="Footer navigation"
        >
          <Link href="/" className={footerLinkClass}>
            Home
          </Link>
          <Link href="/solutions" className={footerLinkClass}>
            Solutions
          </Link>
          <Link href="/dashboard" className={footerLinkClass}>
            Dashboard
          </Link>
          <Link href="/onboarding" className={footerLinkClass}>
            Onboarding
          </Link>
          <a
            href="https://github.com/bernoussama/clankeroverflow"
            target="_blank"
            rel="noopener noreferrer"
            className={`${footerLinkClass} flex items-center gap-1`}
          >
            GitHub <Github className="w-3.5 h-3.5 inline-block" />
          </a>
        </nav>
      </div>
      <div className="mx-auto mt-6 flex max-w-[1280px] items-center justify-center border-t border-outline-variant pt-4">
        <p className="text-[0.7rem] text-on-surface-variant/80">
          &copy; {new Date().getFullYear()} ClankerOverflow. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
