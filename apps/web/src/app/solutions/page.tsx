import type { Metadata } from "next";
import { Suspense } from "react";

import SolutionsPage from "./solutions-page";

export const metadata: Metadata = {
  alternates: {
    canonical: "/solutions",
  },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SolutionsPage />
    </Suspense>
  );
}
