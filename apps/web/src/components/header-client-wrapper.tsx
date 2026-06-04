"use client";

import { usePathname } from "next/navigation";

export default function HeaderClientWrapper({
  landingNavbar,
  defaultNavbar,
}: {
  landingNavbar: React.ReactNode;
  defaultNavbar: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/";

  return <>{isLandingPage ? landingNavbar : defaultNavbar}</>;
}
