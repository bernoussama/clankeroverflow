"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

interface LinkItem {
  to: string;
  label: string;
}

export default function MobileNav({ links }: { links: readonly LinkItem[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="sm:hidden mode-toggle-btn h-9 w-9 flex items-center justify-center shrink-0"
        aria-label="Toggle navigation menu"
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="sm:hidden border-b border-landing bg-background absolute top-full left-0 right-0 py-4 px-6 flex flex-col gap-3 shadow-lg z-40 animate-in fade-in slide-in-from-top-2 duration-150">
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
        </div>
      )}
    </>
  );
}
