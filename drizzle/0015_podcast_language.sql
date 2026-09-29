CREATE TYPE "public"."podcast_language" AS ENUM('en', 'hinglish');--> statement-breakpoint
DROP INDEX "podcasts_lesson_length_idx";--> statement-breakpoint
DROP INDEX "podcasts_note_length_idx";--> statement-breakpoint
ALTER TABLE "podcasts" ADD COLUMN "language" "podcast_language" DEFAULT 'en' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "podcasts_lesson_length_language_idx" ON "podcasts" USING btree ("lesson_id","length","language");--> statement-breakpoint
CREATE UNIQUE INDEX "podcasts_note_length_language_idx" ON "podcasts" USING btree ("note_id","length","language");