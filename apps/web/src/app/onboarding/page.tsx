import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import Onboarding from "./onboarding";

export default async function OnboardingPage() {
  const requestHeaders = await headers();
  const session = await authClient.getSession({
    fetchOptions: {
      headers: {
        cookie: requestHeaders.get("cookie") ?? "",
      },
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="page-shell">
      <div className="page-container max-w-3xl">
        <Onboarding userName={session.user.name} />
      </div>
    </div>
  );
}
