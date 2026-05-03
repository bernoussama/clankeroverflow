import type { Metadata } from "next";

import SolutionsPage from "./solutions-page";

export const metadata: Metadata = {
  alternates: {
    canonical: "/solutions",
  },
};

export default function Page() {
  return <SolutionsPage />;
}
