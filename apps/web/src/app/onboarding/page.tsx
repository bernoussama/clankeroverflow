import type { Metadata } from "next";

import "../../app.css";
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
