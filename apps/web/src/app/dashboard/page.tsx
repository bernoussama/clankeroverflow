import type { Metadata } from "next";

import Dashboard from "./dashboard";

export const metadata: Metadata = {
  alternates: {
    canonical: "/dashboard",
  },
};

export default function DashboardPage() {
  return <Dashboard />;
}
