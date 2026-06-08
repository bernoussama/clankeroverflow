"use client";

import { Search } from "lucide-react";

import { capturePostHogEvent } from "@/lib/posthog-events";

export default function HeroSearchForm() {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const query = formData.get("query")?.toString().trim() ?? "";

    capturePostHogEvent("hero_search_submitted", {
      has_query: query.length > 0,
      query_length: query.length,
      source: "home_hero",
    });
  };

  return (
    <form action="/solutions" className="landing-hero__search" onSubmit={handleSubmit}>
      <div className="landing-hero__search-field">
        <Search aria-hidden="true" />
        <input
          aria-label="Search solutions"
          name="query"
          placeholder="Search verified fixes..."
          type="text"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button type="submit">Search</button>
    </form>
  );
}
