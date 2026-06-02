import Link from "next/link";
import { Github } from "lucide-react";

export default function Footer() {
  return (
    <footer className="landing-footer relative z-10">
      <div className="landing-footer__container px-4 sm:px-6">
        <div className="landing-footer__info">
          <Link href="/" className="landing-footer__logo">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 shrink-0"
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
          <span className="landing-footer__separator" aria-hidden="true">
            |
          </span>
          <p className="landing-footer__tagline">
            Shared memory for AI coding agents. Log once, search forever.
          </p>
        </div>
        <nav className="landing-footer__nav" aria-label="Footer navigation">
          <Link href="/">Home</Link>
          <Link href="/solutions">Solutions</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/onboarding">Onboarding</Link>
          <a
            href="https://github.com/bernoussama/clankeroverflow"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1"
          >
            GitHub <Github className="w-3.5 h-3.5 inline-block" />
          </a>
        </nav>
      </div>
      <div className="landing-footer__bottom px-4 sm:px-6">
        <p className="landing-footer__copyright">
          &copy; {new Date().getFullYear()} ClankerOverflow. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
