CREATE TABLE "team" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "team_slug_unique" UNIQUE("slug")
);--> statement-breakpoint
CREATE TABLE "team_member" (
  "team_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text NOT NULL,
  CONSTRAINT "team_member_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);--> statement-breakpoint
CREATE TABLE "team_kb" (
  "team_id" text PRIMARY KEY NOT NULL,
  "r2_prefix" text NOT NULL,
  "jurisdiction" text DEFAULT 'default' NOT NULL,
  "review_policy" text DEFAULT 'auto' NOT NULL,
  "github_repo" text,
  "github_sync_mode" text DEFAULT 'off' NOT NULL,
  "dream_cursor" integer DEFAULT 0 NOT NULL,
  "dream_spent_tokens" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE TABLE "kb_document" (
  "team_id" text NOT NULL,
  "doc_id" text NOT NULL,
  "path" text NOT NULL,
  "rev" integer NOT NULL,
  "content_hash" text NOT NULL,
  "frontmatter" jsonb NOT NULL,
  "body" text NOT NULL,
  "markdown" text NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kb_document_team_id_doc_id_pk" PRIMARY KEY("team_id","doc_id")
);--> statement-breakpoint
CREATE TABLE "kb_change" (
  "team_id" text NOT NULL,
  "seq" integer NOT NULL,
  "doc_id" text NOT NULL,
  "path" text NOT NULL,
  "rev" integer NOT NULL,
  "op" text NOT NULL,
  "source" text NOT NULL,
  "external_ref" text,
  "author" text,
  "agent" text,
  "session" text,
  "message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kb_change_team_id_seq_pk" PRIMARY KEY("team_id","seq")
);--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_kb" ADD CONSTRAINT "team_kb_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_document" ADD CONSTRAINT "kb_document_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_change" ADD CONSTRAINT "kb_change_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_member_user_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_document_team_path_idx" ON "kb_document" USING btree ("team_id","path");--> statement-breakpoint
CREATE INDEX "kb_change_team_doc_idx" ON "kb_change" USING btree ("team_id","doc_id");--> statement-breakpoint
CREATE INDEX "kb_document_search_idx" ON "kb_document" USING gin (to_tsvector('simple', lower("body")));--> statement-breakpoint
DROP TABLE IF EXISTS "solution_vote";--> statement-breakpoint
DROP TABLE IF EXISTS "solution";
