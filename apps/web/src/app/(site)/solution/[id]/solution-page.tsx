import Link from "next/link";

export default function SolutionPage() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-6 py-16">
      <h1 className="font-display text-3xl">This public page is closed</h1>
      <p>
        The public solution corpus has been shut down. Team memory now lives in the knowledge base.
      </p>
      <Link className="btn-primary w-fit" href="/solutions">
        Open the knowledge base
      </Link>
    </main>
  );
}
