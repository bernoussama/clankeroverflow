"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

import {
  landingMenuItem,
  landingMenuSurface,
  landingPrimaryButton,
  landingSecondaryButton,
} from "./landing-ui";
import { Skeleton } from "./ui/skeleton";

export default function UserMenu({ variant }: { variant?: "default" | "landing" }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isPending) {
    return <Skeleton className="h-9 w-24 rounded-lg" />;
  }

  if (!session) {
    return (
      <Link href="/login" className="hidden sm:inline-flex">
        <button
          type="button"
          className={cn(
            variant === "landing" ? landingPrimaryButton : landingSecondaryButton,
            "h-9 min-h-9 px-4 py-0",
          )}
        >
          Sign In
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </button>
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(landingSecondaryButton, "h-9 min-h-9 max-w-44 truncate px-4 py-0")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {session.user.name}
      </button>

      {open && (
        <div className={cn(landingMenuSurface, "min-w-56")} role="menu">
          <div>
            <div className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-on-surface-variant">
              My Account
            </div>
            <div className="-mx-1 h-px bg-outline-variant" />
            <div className="truncate px-3 py-2 font-mono text-xs text-on-surface">
              {session.user.email}
            </div>
            <button
              type="button"
              className={cn(landingMenuItem, "text-destructive hover:text-destructive")}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      router.push("/");
                    },
                  },
                });
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
