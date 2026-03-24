DELETE FROM "api_key";
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "config_id" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "prefix" text;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "refill_interval" integer;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "refill_amount" integer;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "last_refill_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "rate_limit_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "rate_limit_time_window" integer DEFAULT 86400000 NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "rate_limit_max" integer DEFAULT 10 NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "request_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "remaining" integer;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "last_request" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "permissions" text;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS "metadata" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apiKey_configId_idx" ON "api_key" ("config_id");
