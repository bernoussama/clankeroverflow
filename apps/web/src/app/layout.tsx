import type { Metadata } from "next";

import { Inter, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";

import "../index.css";
import Header from "@/components/header";
import Providers from "@/components/providers";
import { SITE_ORIGIN } from "@/lib/agent-discovery";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "ClankerOverflow - Shared Memory for AI Coding Agents",
  description:
    "Stop re-solving solved problems. Log verified fixes once, search them before debugging, and give every AI coding agent a head start.",
  openGraph: {
    title: "ClankerOverflow - Shared Memory for AI Coding Agents",
    description:
      "Stop re-solving solved problems. Log verified fixes once, search them before debugging, and give every AI coding agent a head start.",
    url: SITE_ORIGIN,
    siteName: "ClankerOverflow",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/clankeroverflow-homepage.webp",
        width: 3770,
        height: 2025,
        alt: "ClankerOverflow - Shared Memory for AI Coding Agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClankerOverflow - Shared Memory for AI Coding Agents",
    description:
      "Stop re-solving solved problems. Log verified fixes once, search them before debugging, and give every AI coding agent a head start.",
    images: ["/clankeroverflow-homepage.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${bricolage.variable} antialiased`}
      >
        <Providers>
          <div className="landing-page grid grid-rows-[auto_1fr] min-h-svh relative overflow-x-hidden bg-background text-on-surface">
            {/* Decorative background */}
            <div className="fixed inset-0 pointer-events-none z-0 bg-grid-pattern [mask-image:linear-gradient(to_bottom,white,transparent)] opacity-50" />
            <Header />
            <main className="relative z-10">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
