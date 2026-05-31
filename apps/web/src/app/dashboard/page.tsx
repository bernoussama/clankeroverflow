import type { Metadata } from "next";

import AppProviders from "@/components/app-providers";

import Dashboard from "./dashboard";

export const metadata: Metadata = {
  alternates: {
    canonical: "/dashboard",
  },
};

export default function DashboardPage() {
  return (
    <AppProviders>
      <Dashboard />
    </AppProviders>
  );
}
