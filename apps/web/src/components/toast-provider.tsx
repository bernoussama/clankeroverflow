"use client";

import { Toaster } from "./ui/sonner";

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster richColors />
    </>
  );
}
