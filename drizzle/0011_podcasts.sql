CREATE TYPE "public"."podcast_length" AS ENUM('short', 'medium', 'long');--> statement-breakpoint
CREATE TYPE "public"."podcast_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "podcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid,
	"note_id" uuid,
	"length" "podcast_length" NOT NULL,
	"script" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audio_url" text,
	"audio_pathname" text,
	"duration_sec" numeric(10, 3),
	"status" "podcast_status" DEFAULT 'generating' NOT NULL,
	"error" text,
	"source_hash" text,
	"prompts_version" integer,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "podcasts_lesson_length_idx" ON "podcasts" USING btree ("lesson_id","length");--> statement-breakpoint
CREATE UNIQUE INDEX "podcasts_note_length_idx" ON "podcasts" USING btree ("note_id","length");