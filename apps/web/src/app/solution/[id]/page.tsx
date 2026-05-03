import type { Metadata } from "next";

import SolutionPage from "./solution-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    alternates: {
      canonical: `/solution/${encodeURIComponent(id)}`,
    },
  };
}

export default function Page() {
  return <SolutionPage />;
}
