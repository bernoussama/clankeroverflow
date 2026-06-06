export const landingIconButton =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low text-on-surface-variant transition-colors hover:border-outline hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export const landingMenuSurface =
  "absolute right-0 top-full z-50 mt-2 min-w-36 rounded-lg border border-outline-variant bg-popover p-1 text-popover-foreground shadow-lg";

export const landingMenuItem =
  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-mono text-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:bg-surface-container focus-visible:text-on-surface focus-visible:outline-none";

export const landingPrimaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

export const landingSecondaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-on-surface transition-colors hover:border-outline hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export const landingNavLink =
  "rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function BrandLogo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
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
        className="stroke-landing-accent"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="7.50266"
        y1="14.7777"
        x2="1.70711"
        y2="13.2247"
        className="stroke-landing-accent"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="7.96068"
        y1="12.4009"
        x2="2.76453"
        y2="9.40086"
        className="stroke-landing-accent"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="9.56853"
        y1="10.3971"
        x2="5.08332"
        y2="6.41176"
        className="stroke-landing-accent"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
