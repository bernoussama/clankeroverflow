CREATE INDEX IF NOT EXISTS "solution_search_vector_unicode_idx" ON "solution" USING gin (
	to_tsvector(
		'simple',
		lower(coalesce("problem", '') || ' ' || coalesce("solution", '') || ' ' || coalesce("tags", ''))
	)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "solution_search_trgm_unicode_idx" ON "solution" USING gin (
	(
		lower(coalesce("problem", '') || ' ' || coalesce("solution", '') || ' ' || coalesce("tags", ''))
	) gin_trgm_ops
);--> statement-breakpoint
DROP INDEX IF EXISTS "solution_search_vector_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "solution_search_trgm_idx";
