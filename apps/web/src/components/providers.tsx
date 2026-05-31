"use client";

import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/trpc";

import { ThemeProvider } from "./theme-provider";
import PostHogAnalytics from "./posthog-analytics";
import { Toaster } from "./ui/sonner";
import WebMCPProvider from "./webmcp-provider";

const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then(({ ReactQueryDevtools }) => ({
    default: ReactQueryDevtools,
  })),
);

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PostHogAnalytics />
      <QueryClientProvider client={queryClient}>
        <WebMCPProvider>{children}</WebMCPProvider>
        {process.env.NODE_ENV === "development" ? (
          <Suspense>
            <ReactQueryDevtools />
          </Suspense>
        ) : null}
      </QueryClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
