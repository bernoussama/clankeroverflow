"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight, Github } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface LinkItem {
  to: string;
  label: string;
}

export default function MobileNav({ links }: { links: readonly LinkItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: session } = authClient.useSession();

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="mode-toggle-btn h-9 w-9 flex items-center justify-center shrink-0"
        aria-label="Toggle navigation menu"
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="border-b border-landing bg-background absolute top-full left-0 right-0 py-4 px-6 flex flex-col gap-3 shadow-lg z-40 animate-in fade-in slide-in-from-top-2 duration-150">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              href={to as any}
              onClick={() => setIsOpen(false)}
              className="py-2.5 px-4 font-mono text-xs tracking-wide uppercase text-muted-landing hover:text-accent-landing transition-colors border border-landing bg-surface-landing/50 hover:bg-surface-landing"
            >
              {label}
            </Link>
          ))}
          <a
            href="https://github.com/bernoussama/clankeroverflow"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setIsOpen(false)}
            className="py-2.5 px-4 font-mono text-xs tracking-wide uppercase text-muted-landing hover:text-accent-landing transition-colors border border-landing bg-surface-landing/50 hover:bg-surface-landing flex items-center justify-between"
          >
            <span>GitHub</span>
            <Github className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
          {!session && (
            <Link
              href="/login"
              onClick={() => setIsOpen(false)}
              className="py-2.5 px-4 font-mono text-xs tracking-wide uppercase text-accent-landing border border-landing-accent/30 bg-landing-accent-subtle hover:bg-landing-accent/20 transition-colors flex items-center justify-between"
            >
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
