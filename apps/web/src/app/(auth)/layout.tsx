import ToastProvider from "@/components/toast-provider";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ToastProvider>
      <div className="landing-page min-h-svh bg-background text-on-surface">
        <main className="min-h-svh">{children}</main>
      </div>
    </ToastProvider>
  );
}
