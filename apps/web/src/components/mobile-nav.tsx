"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight, Github } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { landingIconButton, landingPrimaryButton, landingSecondaryButton } from "./landing-ui";

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
        className={landingIconButton}
        aria-label="Toggle navigation menu"
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-40 flex flex-col gap-3 border-b border-outline-variant bg-background px-6 py-4 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              href={to as any}
              onClick={() => setIsOpen(false)}
              className={landingSecondaryButton}
            >
              {label}
            </Link>
          ))}
          <a
            href="https://github.com/bernoussama/clankeroverflow"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setIsOpen(false)}
            className={landingSecondaryButton}
          >
            <span>GitHub</span>
            <Github className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
          {!session && (
            <Link href="/login" onClick={() => setIsOpen(false)} className={landingPrimaryButton}>
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
