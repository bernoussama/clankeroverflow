import type { Metadata } from "next";

import LoginPage from "./login-page";

export const metadata: Metadata = {
  alternates: {
    canonical: "/login",
  },
};

export default function Page() {
  return <LoginPage />;
}
