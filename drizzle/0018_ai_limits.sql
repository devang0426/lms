CREATE INDEX "ai_usage_user_idx" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","action","created_at");--> statement-breakpoint
/* Feature 25: the guard statement of a race-proof limit (lib/db/limits.ts).
   A db.batch takes the per-person advisory lock, then calls this with
   "count < limit"; when it's false the whole batch is rolled back, so the
   write after it never happens. SQLSTATE SH429 marks the refusal. */
CREATE OR REPLACE FUNCTION enforce_limit(under boolean, what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT under THEN
    RAISE EXCEPTION 'limit reached: %', what USING ERRCODE = 'SH429';
  END IF;
END
$$;
