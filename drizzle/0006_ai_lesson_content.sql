CREATE TYPE "public"."quiz_bank" AS ENUM('practice', 'graded');--> statement-breakpoint
CREATE TYPE "public"."quiz_difficulty" AS ENUM('basic', 'intermediate', 'exam');--> statement-breakpoint
CREATE TYPE "public"."quiz_type" AS ENUM('mcq', 'true_false', 'fill_blank');--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"start_sec" numeric(10, 3) NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"video_id" uuid,
	"prompts_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid,
	"note_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"start_sec" numeric(10, 3),
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"video_id" uuid,
	"prompts_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid,
	"owner_id" uuid,
	"title" text NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"video_id" uuid,
	"prompts_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid,
	"note_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"type" "quiz_type" NOT NULL,
	"difficulty" "quiz_difficulty" NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"question" text NOT NULL,
	"options" text[] NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"start_sec" numeric(10, 3),
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"bank" "quiz_bank" DEFAULT 'practice' NOT NULL,
	"video_id" uuid,
	"prompts_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapters_lesson_idx" ON "chapters" USING btree ("lesson_id","position");--> statement-breakpoint
CREATE INDEX "flashcards_lesson_idx" ON "flashcards" USING btree ("lesson_id","position");--> statement-breakpoint
CREATE INDEX "flashcards_note_idx" ON "flashcards" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_lesson_idx" ON "notes" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "notes_owner_idx" ON "notes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "quiz_questions_lesson_idx" ON "quiz_questions" USING btree ("lesson_id","difficulty","position");--> statement-breakpoint
CREATE INDEX "quiz_questions_note_idx" ON "quiz_questions" USING btree ("note_id");