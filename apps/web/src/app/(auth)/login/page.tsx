import type { Metadata } from "next";

import "../../../app.css";

import LoginPage from "./login-page";

export const metadata: Metadata = {
  alternates: {
    canonical: "/login",
  },
};

export default function Page() {
  return <LoginPage />;
}
