import type { Metadata } from "next";

import ToastProvider from "@/components/toast-provider";

import LoginPage from "./login-page";

export const metadata: Metadata = {
  alternates: {
    canonical: "/login",
  },
};

export default function Page() {
  return (
    <ToastProvider>
      <LoginPage />
    </ToastProvider>
  );
}
