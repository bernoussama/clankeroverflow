CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "solution_search_vector_idx" ON "solution" USING gin (
	to_tsvector(
		'simple',
		btrim(
			regexp_replace(
				lower(
					coalesce("problem", '') || ' ' || coalesce("solution", '') || ' ' || coalesce("tags", '')
				),
				'[^a-z0-9]+',
				' ',
				'g'
			)
		)
	)
);--> statement-breakpoint
CREATE INDEX "solution_search_trgm_idx" ON "solution" USING gin (
	(
		regexp_replace(
			lower(coalesce("problem", '') || coalesce("solution", '') || coalesce("tags", '')),
			'[^a-z0-9]+',
			'',
			'g'
		)
	) gin_trgm_ops
);
