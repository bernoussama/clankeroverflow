import type { Metadata } from "next";

import { Inter, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";

import "../index.css";
import { ThemeProvider } from "@/components/theme-provider";
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

// Configure Zod before client bundles run so strict CSP never triggers its eval capability probe.
const zodJitlessBootstrap =
  "globalThis.__zod_globalConfig = Object.assign(globalThis.__zod_globalConfig || {}, { jitless: true });";

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
        width: 1885,
        height: 1012,
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
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <script id="zod-jitless" dangerouslySetInnerHTML={{ __html: zodJitlessBootstrap }} />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${bricolage.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
