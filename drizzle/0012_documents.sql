CREATE TYPE "public"."document_kind" AS ENUM('pdf', 'docx', 'url', 'audio', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid,
	"owner_id" uuid,
	"kind" "document_kind" NOT NULL,
	"title" text NOT NULL,
	"filename" text,
	"blob_url" text,
	"pathname" text,
	"url" text,
	"content_type" text,
	"size_bytes" bigint,
	"page_count" integer,
	"duration_sec" numeric(10, 3),
	"text" text DEFAULT '' NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "document_status" DEFAULT 'uploading' NOT NULL,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_chunks" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "content_chunks" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_lesson_idx" ON "documents" USING btree ("lesson_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_chunks_document_idx" ON "content_chunks" USING btree ("document_id");