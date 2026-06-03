import type { Metadata } from "next";

import CliAuthClient from "./cli-auth-client";

export const dynamic = "force-static";

export const metadata: Metadata = {
  alternates: {
    canonical: "/cli-auth",
  },
};

export default function Page() {
  return <CliAuthClient />;
}
