"use client";

import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/utils/trpc";

import { Toaster } from "./ui/sonner";
import WebMCPProvider from "./webmcp-provider";

const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then(({ ReactQueryDevtools }) => ({
    default: ReactQueryDevtools,
  })),
);

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WebMCPProvider>{children}</WebMCPProvider>
      {process.env.NODE_ENV === "development" ? (
        <Suspense>
          <ReactQueryDevtools />
        </Suspense>
      ) : null}
      <Toaster richColors />
    </QueryClientProvider>
  );
}
