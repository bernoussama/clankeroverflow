import type { Metadata } from "next";

import AppProviders from "@/components/app-providers";

import Onboarding from "./onboarding";

export const metadata: Metadata = {
  alternates: {
    canonical: "/onboarding",
  },
};

export default function OnboardingPage() {
  return (
    <AppProviders>
      <Onboarding />
    </AppProviders>
  );
}
