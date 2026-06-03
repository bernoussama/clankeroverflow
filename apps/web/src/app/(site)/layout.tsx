import Footer from "@/components/footer";
import Header from "@/components/header";
import PostHogAnalytics from "@/components/posthog-analytics";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <PostHogAnalytics />
      <div className="landing-page flex flex-col min-h-svh relative overflow-x-hidden bg-background text-on-surface">
        <div className="fixed inset-0 pointer-events-none z-0 bg-grid-pattern [mask-image:linear-gradient(to_bottom,white,transparent)] opacity-50" />
        <Header />
        <main className="relative z-10 min-w-0 w-full flex-grow">{children}</main>
        <Footer />
      </div>
    </>
  );
}
