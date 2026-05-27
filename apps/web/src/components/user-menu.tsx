import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { authClient } from "@/lib/auth-client";

import { Skeleton } from "./ui/skeleton";

export default function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);

  if (isPending) {
    return <Skeleton className="h-9 w-24 rounded-none" />;
  }

  if (!session) {
    return (
      <Link href="/login">
        <button
          type="button"
          className="btn-secondary h-9 py-0 px-4 text-xs font-mono uppercase tracking-wider"
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
        className="btn-secondary h-9 py-0 px-4 text-xs font-mono uppercase tracking-wider"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {session.user.name}
      </button>
      {open && (
        <div
          className="bg-card dropdown-content absolute right-0 top-full z-50 mt-2 min-w-48"
          role="menu"
        >
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-muted-landing px-2 py-2">
              My Account
            </div>
            <div className="bg-surface-landing -mx-1 h-px" />
            <div className="font-mono text-xs px-2 py-2">{session.user.email}</div>
            <button
              type="button"
              className="block w-full px-2 py-2 text-left font-mono text-xs text-destructive"
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
