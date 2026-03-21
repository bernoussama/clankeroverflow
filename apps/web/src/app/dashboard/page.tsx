import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import Dashboard from "./dashboard";

export default async function DashboardPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="mb-10">
          <p className="font-mono text-sm tracking-widest uppercase text-accent-landing mb-3">
            Dashboard
          </p>
          <h1 className="page-title text-3xl sm:text-4xl">Welcome, {session.user.name}</h1>
        </div>
        <Dashboard session={session} />
      </div>
    </div>
  );
}
