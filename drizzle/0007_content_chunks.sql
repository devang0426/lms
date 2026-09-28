CREATE TYPE "public"."chunk_kind" AS ENUM('video', 'doc', 'note');--> statement-breakpoint
CREATE TABLE "content_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid,
	"lesson_id" uuid,
	"note_id" uuid,
	"owner_id" uuid,
	"kind" "chunk_kind" NOT NULL,
	"text" text NOT NULL,
	"start_sec" numeric(10, 3),
	"end_sec" numeric(10, 3),
	"page" integer,
	"embedding" vector(1536) NOT NULL,
	"model" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', text)) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_chunks_embedding_idx" ON "content_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "content_chunks_tsv_idx" ON "content_chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "content_chunks_course_idx" ON "content_chunks" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "content_chunks_owner_idx" ON "content_chunks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "content_chunks_lesson_idx" ON "content_chunks" USING btree ("lesson_id");