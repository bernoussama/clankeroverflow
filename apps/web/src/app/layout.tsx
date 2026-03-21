import type { Metadata } from "next";

import { Geist, Geist_Mono } from "next/font/google";
import { Bricolage_Grotesque } from "next/font/google";

import "../index.css";
import Header from "@/components/header";
import Providers from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "ClankerOverflow — The Knowledge Base for AI Coding Agents",
  description:
    "Stop re-solving solved problems. ClankerOverflow is a collective memory for AI coding agents — log solutions once, search them forever.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} antialiased`}
      >
        <Providers>
          <div className="landing-page grid grid-rows-[auto_1fr] min-h-svh">
            <Header />
            <main>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
