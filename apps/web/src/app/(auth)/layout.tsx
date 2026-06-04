import ToastProvider from "@/components/toast-provider";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ToastProvider>
      <div className="landing-page min-h-svh bg-background text-on-surface relative">
        <div className="fixed inset-0 pointer-events-none z-0 bg-grid-pattern [mask-image:linear-gradient(to_bottom,white,transparent)] opacity-50" />
        <main className="min-h-svh relative z-10 flex flex-col justify-center">{children}</main>
      </div>
    </ToastProvider>
  );
}
