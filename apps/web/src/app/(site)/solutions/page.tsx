import type { Metadata } from "next";
import { Suspense } from "react";

import "../../../app.css";
import AppProviders from "@/components/app-providers";

import SolutionsPage from "./solutions-page";

export const metadata: Metadata = {
  alternates: {
    canonical: "/solutions",
  },
};

export default function Page() {
  return (
    <AppProviders>
      <Suspense fallback={null}>
        <SolutionsPage />
      </Suspense>
    </AppProviders>
  );
}
