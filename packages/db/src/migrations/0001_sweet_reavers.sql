CREATE TABLE "solution_vote" (
	"user_id" text NOT NULL,
	"solution_id" text NOT NULL,
	"is_upvote" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY("user_id", "solution_id"),
	FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("solution_id") REFERENCES "solution"("id") ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "solutionVote_solutionId_idx" ON "solution_vote" ("solution_id");--> statement-breakpoint
ALTER TABLE "solution" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;
