CREATE TYPE "public"."quiz_mode" AS ENUM('practice', 'graded');--> statement-breakpoint
CREATE TABLE "graded_quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"title" text NOT NULL,
	"question_ids" uuid[] NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"points" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_answers" (
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"correct" boolean NOT NULL,
	CONSTRAINT "quiz_answers_attempt_id_question_id_pk" PRIMARY KEY("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"mode" "quiz_mode" NOT NULL,
	"graded_quiz_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"score" numeric(5, 4)
);
--> statement-breakpoint
ALTER TABLE "graded_quizzes" ADD CONSTRAINT "graded_quizzes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graded_quizzes" ADD CONSTRAINT "graded_quizzes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_graded_quiz_id_graded_quizzes_id_fk" FOREIGN KEY ("graded_quiz_id") REFERENCES "public"."graded_quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "graded_quizzes_lesson_idx" ON "graded_quizzes" USING btree ("lesson_id","due_at");--> statement-breakpoint
CREATE INDEX "quiz_answers_question_idx" ON "quiz_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_lesson_idx" ON "quiz_attempts" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_graded_idx" ON "quiz_attempts" USING btree ("graded_quiz_id","user_id");