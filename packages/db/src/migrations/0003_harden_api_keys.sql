CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "key_preview" text;
--> statement-breakpoint
UPDATE "api_key"
SET
  "key_preview" = left("key", 8) || '...' || right("key", 4),
  "key" = encode(digest("key", 'sha256'), 'hex')
WHERE "key_preview" IS NULL;
--> statement-breakpoint
ALTER TABLE "api_key" ALTER COLUMN "key_preview" SET NOT NULL;
