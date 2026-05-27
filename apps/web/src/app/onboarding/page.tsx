import type { Metadata } from "next";

import Onboarding from "./onboarding";

export const metadata: Metadata = {
  alternates: {
    canonical: "/onboarding",
  },
};

export default function OnboardingPage() {
  return <Onboarding />;
}
