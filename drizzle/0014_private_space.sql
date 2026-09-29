ALTER TABLE "chat_threads" ALTER COLUMN "course_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ALTER COLUMN "lesson_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "note_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "note_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "note_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_threads_note_idx" ON "chat_threads" USING btree ("user_id","note_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_note_idx" ON "documents" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_note_idx" ON "quiz_attempts" USING btree ("user_id","note_id");--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_course_or_note" CHECK (("chat_threads"."course_id" is null) <> ("chat_threads"."note_id" is null));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_lesson_or_owner" CHECK (("documents"."lesson_id" is null) <> ("documents"."owner_id" is null));--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_lesson_or_owner" CHECK (("notes"."lesson_id" is null) <> ("notes"."owner_id" is null));--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_lesson_or_note" CHECK (("quiz_attempts"."lesson_id" is null) <> ("quiz_attempts"."note_id" is null));