"use client";

import { ThemeProvider } from "./theme-provider";
import PostHogAnalytics from "./posthog-analytics";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PostHogAnalytics />
      {children}
    </ThemeProvider>
  );
}
