import Link from "next/link";
import { Github } from "lucide-react";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";
import MobileNav from "./mobile-nav";
import HeaderClientWrapper from "./header-client-wrapper";

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/solutions", label: "Solutions" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  const landingLinks = [
    { to: "/solutions", label: "Solutions" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  const landingNavbar = (
    <nav className="bg-surface-container-low w-full top-0 fixed left-0 right-0 border-b border-outline z-50">
      <div className="flex justify-between items-center w-full px-4 sm:px-6 py-3 max-w-[1280px] mx-auto h-16">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-display font-bold text-sm sm:text-base tracking-tight hover:opacity-80 transition-opacity"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 shrink-0"
              aria-hidden="true"
            >
              <path
                d="M12 19H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="7"
                y1="17"
                x2="1"
                y2="17"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="7.50266"
                y1="14.7777"
                x2="1.70711"
                y2="13.2247"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="7.96068"
                y1="12.4009"
                x2="2.76453"
                y2="9.40086"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="9.56853"
                y1="10.3971"
                x2="5.08332"
                y2="6.41176"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>ClankerOverflow</span>
          </Link>
          <div className="hidden md:flex gap-6 items-center">
            <Link
              href="/solutions"
              className="text-on-surface font-mono text-[13px] tracking-wide uppercase hover:text-primary transition-colors"
            >
              Solutions
            </Link>
            <a
              href="https://github.com/bernoussama/clankeroverflow#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="text-on-surface font-mono text-[13px] tracking-wide uppercase hover:text-primary transition-colors"
            >
              Resources
            </a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-on-surface-variant">
            <a
              href="https://github.com/bernoussama/clankeroverflow"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-on-surface transition-colors h-9 w-9 flex items-center justify-center shrink-0"
              aria-label="GitHub Repository"
            >
              <Github className="w-5 h-5" />
            </a>
            <ModeToggle />
            <UserMenu variant="landing" />
            <MobileNav links={landingLinks} />
          </div>
        </div>
      </div>
    </nav>
  );

  const defaultNavbar = (
    <header className="landing-header">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 max-w-[1280px] mx-auto w-full">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-display font-bold text-sm sm:text-base tracking-tight hover:opacity-80 transition-opacity"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 shrink-0"
              aria-hidden="true"
            >
              <path
                d="M12 19H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="7"
                y1="17"
                x2="1"
                y2="17"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="7.50266"
                y1="14.7777"
                x2="1.70711"
                y2="13.2247"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="7.96068"
                y1="12.4009"
                x2="2.76453"
                y2="9.40086"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="9.56853"
                y1="10.3971"
                x2="5.08332"
                y2="6.41176"
                stroke="var(--landing-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>ClankerOverflow</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map(({ to, label }) => (
              <Link
                key={to}
                href={to}
                className="px-3 py-1.5 text-xs font-mono tracking-wide uppercase text-muted-landing hover:text-accent-landing transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <a
            href="https://github.com/bernoussama/clankeroverflow"
            target="_blank"
            rel="noopener noreferrer"
            className="mode-toggle-btn h-9 w-9 flex items-center justify-center shrink-0"
            aria-label="GitHub Repository"
          >
            <Github className="w-4 h-4" />
          </a>
          <ModeToggle />
          <UserMenu />
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  );

  return <HeaderClientWrapper landingNavbar={landingNavbar} defaultNavbar={defaultNavbar} />;
}
