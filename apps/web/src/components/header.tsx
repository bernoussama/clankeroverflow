import Link from "next/link";
import { Github } from "lucide-react";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";
import MobileNav from "./mobile-nav";
import HeaderClientWrapper from "./header-client-wrapper";
import { BrandLogo, landingIconButton, landingNavLink } from "./landing-ui";

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
    <nav className="fixed left-0 right-0 top-0 z-50 w-full border-b border-outline-variant bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md font-display text-sm font-bold tracking-tight text-on-surface transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-base"
          >
            <BrandLogo className="h-6 w-6 shrink-0" />
            <span>ClankerOverflow</span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            <Link href="/solutions" className={landingNavLink}>
              Solutions
            </Link>
            <a
              href="https://github.com/bernoussama/clankeroverflow#readme"
              target="_blank"
              rel="noopener noreferrer"
              className={landingNavLink}
            >
              Resources
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <a
              href="https://github.com/bernoussama/clankeroverflow"
              target="_blank"
              rel="noopener noreferrer"
              className={landingIconButton}
              aria-label="GitHub Repository"
            >
              <Github className="h-4 w-4" />
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
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-outline-variant bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md font-display text-sm font-bold tracking-tight text-on-surface transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-base"
          >
            <BrandLogo className="h-6 w-6 shrink-0" />
            <span>ClankerOverflow</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map(({ to, label }) => (
              <Link key={to} href={to} className={landingNavLink}>
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
            className={landingIconButton}
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
