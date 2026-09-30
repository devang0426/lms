ALTER TYPE "public"."notification_kind" ADD VALUE 'draft_ready';--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "card_reviews_card_idx" ON "card_reviews" USING btree ("card_id");