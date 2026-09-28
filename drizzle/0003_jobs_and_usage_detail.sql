CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"trigger_run_id" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"stage" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_trigger_run_id_unique" UNIQUE("trigger_run_id")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(16, 10);--> statement-breakpoint
ALTER TABLE "ai_usage" ALTER COLUMN "cost_usd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "task" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_entity_idx" ON "jobs" USING btree ("entity_type","entity_id","created_at");