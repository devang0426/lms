CREATE TYPE "public"."video_status" AS ENUM('uploading', 'processing', 'ready', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"start_sec" numeric(10, 3) NOT NULL,
	"end_sec" numeric(10, 3) NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"blob_url" text,
	"pathname" text,
	"poster_url" text,
	"vtt_url" text,
	"duration_sec" numeric(10, 3),
	"width" integer,
	"height" integer,
	"codec" text,
	"size_bytes" bigint,
	"faststart" boolean DEFAULT false NOT NULL,
	"status" "video_status" DEFAULT 'uploading' NOT NULL,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_segments_lesson_start_idx" ON "transcript_segments" USING btree ("lesson_id","start_sec");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segments_video_idx" ON "transcript_segments" USING btree ("video_id","idx");--> statement-breakpoint
CREATE INDEX "videos_lesson_idx" ON "videos" USING btree ("lesson_id","created_at");