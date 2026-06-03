CREATE TABLE IF NOT EXISTS "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp with time zone,
	"polling_interval" integer,
	"client_id" text,
	"scope" text,
	CONSTRAINT "device_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deviceCode_deviceCode_idx" ON "device_code" ("device_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deviceCode_userCode_idx" ON "device_code" ("user_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deviceCode_userId_idx" ON "device_code" ("user_id");
