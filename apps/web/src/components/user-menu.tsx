import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

import { Skeleton } from "./ui/skeleton";

export default function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-9 w-24 rounded-sm" />;
  }

  if (!session) {
    return (
      <Link href="/login">
        <button type="button" className="btn-secondary h-9 py-0 px-4 text-xs font-mono uppercase tracking-wider">
          Sign In
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="btn-secondary h-9 py-0 px-4 text-xs font-mono uppercase tracking-wider"
          />
        }
      >
        {session.user.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card dropdown-content">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-xs uppercase tracking-wider text-muted-landing">
            My Account
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-surface-landing" />
          <DropdownMenuItem className="font-mono text-xs">{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="font-mono text-xs"
            onClick={() => {
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
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
