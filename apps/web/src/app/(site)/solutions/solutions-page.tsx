"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { capturePostHogEvent } from "@/lib/posthog-events";
import { trpcClient } from "@/utils/trpc";

type Hit = {
  id: string;
  problem: string;
  solution: string;
  path: string;
  status: string | null;
};

export default function SolutionsPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("query") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [catalog, setCatalog] = useState("");
  const [document, setDocument] = useState("");
  const [error, setError] = useState("");

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    capturePostHogEvent("knowledge_search_submitted", {
      has_query: trimmedQuery.length > 0,
      query_length: trimmedQuery.length,
      source: "knowledge",
    });
    if (!trimmedQuery) {
      setHits([]);
      return;
    }
    try {
      const results = await trpcClient.kb.search.query({ query: trimmedQuery, limit: 10 });
      setHits(results);
      setError("");
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed");
    }
  }

  async function openDocument(path: string) {
    capturePostHogEvent("knowledge_document_opened", { source: "knowledge" });
    const loaded = await trpcClient.kb.read.query({ path });
    setDocument(loaded.markdown);
  }

  async function showCatalog() {
    setCatalog(await trpcClient.kb.browse.query({}));
  }

  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl">Team knowledge</h1>
        <p className="text-sm text-muted-landing">
          Search the markdown your agents already wrote. Drafts stay visible and are marked.
        </p>
      </header>
      <form className="landing-card flex gap-2 p-4" onSubmit={search}>
        <input
          aria-label="Search the knowledge base"
          className="min-w-0 flex-1 bg-transparent outline-none"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="btn-primary" type="submit">
          Search
        </button>
        <button className="btn-primary" type="button" onClick={showCatalog}>
          Browse
        </button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {catalog ? <pre className="landing-card overflow-auto p-4 text-sm">{catalog}</pre> : null}
      <ul className="flex flex-col gap-3">
        {hits.map((hit) => (
          <li key={hit.id}>
            <button
              className="landing-card w-full p-4 text-left"
              type="button"
              onClick={() => openDocument(hit.path)}
            >
              <span className="font-mono text-xs uppercase">{hit.status ?? "note"}</span>
              <span className="mt-1 block">{hit.problem}</span>
              <span className="mt-2 block text-sm text-muted-landing">{hit.solution}</span>
            </button>
          </li>
        ))}
      </ul>
      {document ? (
        <article className="landing-card whitespace-pre-wrap p-4">{document}</article>
      ) : null}
    </main>
  );
}
