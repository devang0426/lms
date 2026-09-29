/* Drizzle schema — base tables (feature 02). Later features add their own
   tables here; see context/architecture.md → Storage Model. */

import {
  bigint,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Block, DocPart, PodcastLine } from "@/lib/ai/types";
import type { ChatCitation } from "@/lib/chat/types";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const roleEnum = pgEnum("role", ["admin", "instructor", "student"]);
export type Role = (typeof roleEnum.enumValues)[number];
export const ROLES = roleEnum.enumValues;

/* Mirror of Clerk users. Clerk owns identity and the role (publicMetadata.role);
   this row is what the data layer joins against. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull().unique(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    role: roleEnum("role").notNull().default("student"),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("users_email_idx").on(t.email)],
);

export const terms = pgTable("terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  ...timestamps,
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId)],
);

/* One row per provider call, written by lib/ai/usage.ts (feature 09).
   Log only — no quotas in v1. Single calls cost fractions of a cent, hence
   10 decimal places. `estimated` = the provider reported no cost (speech),
   so it was priced from the list price. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    feature: text("feature").notNull(),
    task: text("task").notNull().default("chat"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 16, scale: 10 }).notNull().default("0"),
    estimated: boolean("estimated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_feature_idx").on(t.feature, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/* ---- Background jobs (feature 09) -----------------------------------------
   One row per Trigger.dev run we start. Tasks mirror their stage and
   progress here as well as in run metadata, so the history survives after
   Realtime stops streaming. */

export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "completed", "failed", "canceled"]);
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /* The Trigger.dev task id, e.g. "video-process". */
    kind: text("kind").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    triggerRunId: text("trigger_run_id").notNull().unique(),
    status: jobStatusEnum("status").notNull().default("queued"),
    stage: text("stage"),
    progress: integer("progress").notNull().default(0),
    message: text("message"),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("jobs_entity_idx").on(t.entityType, t.entityId, t.createdAt)],
);

export type Job = typeof jobs.$inferSelect;

/* ---- Courses, modules, lessons (feature 07) ------------------------------
   Course access lives only here: course_staff for teaching, enrollments
   (through a section) for students. Students see a lesson only when the
   course, its module and the lesson are all published. */

export const publishStatusEnum = pgEnum("publish_status", ["draft", "published"]);
export type PublishStatus = (typeof publishStatusEnum.enumValues)[number];

export const lessonStatusEnum = pgEnum("lesson_status", ["draft", "processing", "ready", "published"]);
export type LessonStatus = (typeof lessonStatusEnum.enumValues)[number];

export const lessonKindEnum = pgEnum("lesson_kind", ["video", "reading", "quiz", "assignment"]);
export type LessonKind = (typeof lessonKindEnum.enumValues)[number];
export const LESSON_KINDS = lessonKindEnum.enumValues;

export const coverTintEnum = pgEnum("cover_tint", ["clay", "sage", "butter", "stripe"]);
export type CoverTintValue = (typeof coverTintEnum.enumValues)[number];
export const COVER_TINTS = coverTintEnum.enumValues;

export const staffRoleEnum = pgEnum("staff_role", ["instructor", "ta"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ["active", "dropped"]);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    subject: text("subject").notNull().default(""),
    level: text("level").notNull().default(""),
    summary: text("summary").notNull().default(""),
    outcomes: text("outcomes").array().notNull().default(sql`'{}'::text[]`),
    coverTint: coverTintEnum("cover_tint").notNull().default("stripe"),
    status: publishStatusEnum("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [uniqueIndex("courses_term_code_idx").on(t.termId, t.code)],
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("sections_course_name_idx").on(t.courseId, t.name)],
);

export const courseStaff = pgTable(
  "course_staff",
  {
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: staffRoleEnum("role").notNull().default("instructor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.userId] }), index("course_staff_user_idx").on(t.userId)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.userId] }), index("enrollments_user_idx").on(t.userId)],
);

export const modules = pgTable(
  "modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    status: publishStatusEnum("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [index("modules_course_position_idx").on(t.courseId, t.position)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: lessonKindEnum("kind").notNull().default("video"),
    title: text("title").notNull(),
    durationSec: integer("duration_sec"),
    status: lessonStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("lessons_module_position_idx").on(t.moduleId, t.position)],
);

/* ---- Video lessons (feature 10) -------------------------------------------
   One row per uploaded file. A replacement upload gets a new row; once it
   is ready the older rows, their blobs and segments are removed. Blob URLs
   are public but unguessable (random suffix) — hand them out only after an
   enrollment or staff check. */

export const videoStatusEnum = pgEnum("video_status", ["uploading", "processing", "ready", "rejected", "failed"]);
export type VideoStatus = (typeof videoStatusEnum.enumValues)[number];

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url"),
    pathname: text("pathname"),
    posterUrl: text("poster_url"),
    vttUrl: text("vtt_url"),
    durationSec: numeric("duration_sec", { precision: 10, scale: 3, mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    codec: text("codec"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    /* True once the moov atom is known to be at the front (seekable early). */
    faststart: boolean("faststart").notNull().default(false),
    status: videoStatusEnum("status").notNull().default("uploading"),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("videos_lesson_idx").on(t.lessonId, t.createdAt)],
);

/* Whisper segments with their real timestamps (invariant 7). Citations,
   chapters and the transcript panel all hang off startSec. */
export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    startSec: numeric("start_sec", { precision: 10, scale: 3, mode: "number" }).notNull(),
    endSec: numeric("end_sec", { precision: 10, scale: 3, mode: "number" }).notNull(),
    text: text("text").notNull(),
  },
  (t) => [
    index("transcript_segments_lesson_start_idx").on(t.lessonId, t.startSec),
    uniqueIndex("transcript_segments_video_idx").on(t.videoId, t.idx),
  ],
);

export type Video = typeof videos.$inferSelect;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;

export type Course = typeof courses.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;

/* ---- Student activity in the lesson player (feature 11) -------------------
   Personal: only the owning student reads or writes these rows. Times are
   seconds. `watchedRanges` is a sorted, merged list of [startSec, endSec]
   pairs (lib/video/watch.ts); completedAt is set at 90% watched or by
   "Mark complete" and never cleared. */

export type WatchedRange = [number, number];

export const watchProgress = pgTable(
  "watch_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    positionSec: numeric("position_sec", { precision: 10, scale: 3, mode: "number" }).notNull().default(0),
    watchedRanges: jsonb("watched_ranges").$type<WatchedRange[]>().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] }), index("watch_progress_lesson_idx").on(t.lessonId)],
);

export const lessonNotes = pgTable(
  "lesson_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    atSec: numeric("at_sec", { precision: 10, scale: 3, mode: "number" }).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lesson_notes_user_lesson_idx").on(t.userId, t.lessonId, t.atSec)],
);

export type WatchProgress = typeof watchProgress.$inferSelect;
export type LessonNote = typeof lessonNotes.$inferSelect;

/* ---- AI lesson content (feature 12) ---------------------------------------
   Drafted by the pipeline after transcription, reviewed and edited by the
   instructor, published together with the lesson. Every row keeps
   `videoId` (the video it was generated from, so a replacement upload
   redrafts) and `promptsVersion`. Students see an item only when it is
   published and the lesson itself is visible to them. Chapters have no
   status of their own: they follow the lesson. */

export const quizTypeEnum = pgEnum("quiz_type", ["mcq", "true_false", "fill_blank"]);
export const quizDifficultyEnum = pgEnum("quiz_difficulty", ["basic", "intermediate", "exam"]);
export const quizBankEnum = pgEnum("quiz_bank", ["practice", "graded"]);
export type QuizType = (typeof quizTypeEnum.enumValues)[number];
export type QuizDifficulty = (typeof quizDifficultyEnum.enumValues)[number];
export type QuizBank = (typeof quizBankEnum.enumValues)[number];
export const QUIZ_DIFFICULTIES = quizDifficultyEnum.enumValues;
export const QUIZ_BANKS = quizBankEnum.enumValues;

const generated = {
  videoId: uuid("video_id").references(() => videos.id, { onDelete: "set null" }),
  promptsVersion: integer("prompts_version").notNull(),
};

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    startSec: numeric("start_sec", { precision: 10, scale: 3, mode: "number" }).notNull(),
    summary: text("summary").notNull().default(""),
    ...generated,
    ...timestamps,
  },
  (t) => [index("chapters_lesson_idx").on(t.lessonId, t.position)],
);

/* One lesson note per lesson (lessonId unique). Private notes (feature 19)
   have ownerId set and no lessonId: only their owner ever reads them, and
   what's made from them (cards, questions, chunks, podcast, chat, the
   source document) points back with noteId. `blocks` is the editor model
   from lib/markdown.ts; a heading block may carry `startSec`. */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    blocks: jsonb("blocks").$type<Block[]>().notNull().default([]),
    status: publishStatusEnum("status").notNull().default("draft"),
    ...generated,
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notes_lesson_idx").on(t.lessonId),
    index("notes_owner_idx").on(t.ownerId),
    check("notes_lesson_or_owner", sql`(${t.lessonId} is null) <> (${t.ownerId} is null)`),
  ],
);

export const flashcards = pgTable(
  "flashcards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    front: text("front").notNull(),
    back: text("back").notNull(),
    topic: text("topic").notNull().default(""),
    startSec: numeric("start_sec", { precision: 10, scale: 3, mode: "number" }),
    status: publishStatusEnum("status").notNull().default("draft"),
    ...generated,
    ...timestamps,
  },
  (t) => [index("flashcards_lesson_idx").on(t.lessonId, t.position), index("flashcards_note_idx").on(t.noteId)],
);

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    type: quizTypeEnum("type").notNull(),
    difficulty: quizDifficultyEnum("difficulty").notNull(),
    topic: text("topic").notNull().default(""),
    question: text("question").notNull(),
    options: text("options").array().notNull(),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation").notNull().default(""),
    startSec: numeric("start_sec", { precision: 10, scale: 3, mode: "number" }),
    status: publishStatusEnum("status").notNull().default("draft"),
    bank: quizBankEnum("bank").notNull().default("practice"),
    ...generated,
    ...timestamps,
  },
  (t) => [index("quiz_questions_lesson_idx").on(t.lessonId, t.difficulty, t.position), index("quiz_questions_note_idx").on(t.noteId)],
);

export type Chapter = typeof chapters.$inferSelect;
export type LessonNoteDoc = typeof notes.$inferSelect;
export type FlashcardRow = typeof flashcards.$inferSelect;
export type QuizQuestionRow = typeof quizQuestions.$inferSelect;

/* ---- Retrieval index (feature 13) -----------------------------------------
   What the course assistant searches. A published lesson's transcript is
   cut into windows (lib/ai/retrieval/chunk-transcript.ts) and embedded;
   Publish writes them, Unpublish deletes them. Private uploads (feature 19)
   set ownerId instead of courseId. Search never trusts that a row exists
   only for published content: the access filter in lib/db/chunks.ts
   checks the course, module and lesson status and the enrollment in SQL. */

/* The embedding width of OPENROUTER_DEFAULT_CHAINS.embeddings
   (text-embedding-3-small). A different model needs a migration. */
export const EMBEDDING_DIMENSIONS = 1536;

export const chunkKindEnum = pgEnum("chunk_kind", ["video", "doc", "note"]);
export type ChunkKind = (typeof chunkKindEnum.enumValues)[number];

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const contentChunks = pgTable(
  "content_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    kind: chunkKindEnum("kind").notNull(),
    text: text("text").notNull(),
    startSec: numeric("start_sec", { precision: 10, scale: 3, mode: "number" }),
    endSec: numeric("end_sec", { precision: 10, scale: 3, mode: "number" }),
    page: integer("page"),
    /* Document chunks (feature 18): the source file, and the heading of a
       DOCX or web-page section. */
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
    section: text("section"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    model: text("model").notNull(),
    tsv: tsvector("tsv")
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('english', text)`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("content_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("content_chunks_tsv_idx").using("gin", t.tsv),
    index("content_chunks_course_idx").on(t.courseId),
    index("content_chunks_owner_idx").on(t.ownerId),
    index("content_chunks_lesson_idx").on(t.lessonId),
    index("content_chunks_document_idx").on(t.documentId),
  ],
);

export type ContentChunk = typeof contentChunks.$inferSelect;

/* ---- Course assistant (feature 14) -----------------------------------------
   Personal: only the thread's owner reads it. A thread is scoped to a
   course, and to one lesson when asked from the player. Each assistant
   turn keeps the chunks it was given, whether it refused, and the
   citations that survived the server's check. In `content`, [S1] refers
   to citations[0], [S2] to citations[1], and so on. */

export type { ChatCitation };

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /* A course thread; a private note's chat (feature 19) has noteId instead. */
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_threads_user_idx").on(t.userId, t.courseId, t.createdAt),
    index("chat_threads_note_idx").on(t.userId, t.noteId, t.createdAt),
    check("chat_threads_course_or_note", sql`(${t.courseId} is null) <> (${t.noteId} is null)`),
  ],
);

export const chatTurns = pgTable(
  "chat_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<ChatCitation[]>().notNull().default([]),
    refused: boolean("refused").notNull().default(false),
    retrievedChunkIds: uuid("retrieved_chunk_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_turns_thread_idx").on(t.threadId, t.createdAt)],
);

/* ---- Flashcard reviews (feature 15) -----------------------------------------
   FSRS state per (student, card): cards are shared, review history is
   personal. A card with no row is new and due now. Values come from
   lib/study/fsrs.ts, applied on the server (stability is in days). */

export const cardStateEnum = pgEnum("card_state", ["new", "learning", "review", "relearning"]);
export type CardState = (typeof cardStateEnum.enumValues)[number];

export const cardReviews = pgTable(
  "card_reviews",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: doublePrecision("stability").notNull(),
    difficulty: doublePrecision("difficulty").notNull(),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    lastReview: timestamp("last_review", { withTimezone: true }),
    state: cardStateEnum("state").notNull().default("new"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] }), index("card_reviews_user_due_idx").on(t.userId, t.due)],
);

export type CardReview = typeof cardReviews.$inferSelect;

/* ---- Quizzes (feature 16) ---------------------------------------------------
   Practice draws from a lesson's `practice` bank; a graded quiz is a set of
   the instructor's picked questions, which move to the `graded` bank so
   practice never shows them (or their answers). Every answer is checked on
   the server. `score` is the fraction correct, 0–1; a graded quiz's points
   multiply it in the gradebook (feature 20). An attempt left unsubmitted
   still counts toward the limit. */

export const quizModeEnum = pgEnum("quiz_mode", ["practice", "graded"]);
export type QuizMode = (typeof quizModeEnum.enumValues)[number];

export const gradedQuizzes = pgTable(
  "graded_quizzes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    questionIds: uuid("question_ids").array().notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    maxAttempts: integer("max_attempts").notNull().default(1),
    points: integer("points").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("graded_quizzes_lesson_idx").on(t.lessonId, t.dueAt)],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /* A lesson's quiz; practice on a private note (feature 19) sets noteId instead. */
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    mode: quizModeEnum("mode").notNull(),
    /* Set for graded attempts: the attempt limit counts per quiz. */
    gradedQuizId: uuid("graded_quiz_id").references(() => gradedQuizzes.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    score: numeric("score", { precision: 5, scale: 4, mode: "number" }),
  },
  (t) => [
    index("quiz_attempts_user_lesson_idx").on(t.userId, t.lessonId),
    index("quiz_attempts_user_note_idx").on(t.userId, t.noteId),
    index("quiz_attempts_graded_idx").on(t.gradedQuizId, t.userId),
    check("quiz_attempts_lesson_or_note", sql`(${t.lessonId} is null) <> (${t.noteId} is null)`),
  ],
);

export const quizAnswers = pgTable(
  "quiz_answers",
  {
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    /* The chosen option's index for mcq / true_false, the typed text for fill_blank. */
    answer: text("answer").notNull(),
    correct: boolean("correct").notNull(),
  },
  (t) => [primaryKey({ columns: [t.attemptId, t.questionId] }), index("quiz_answers_question_idx").on(t.questionId)],
);

export type GradedQuiz = typeof gradedQuizzes.$inferSelect;
export type QuizAttemptRow = typeof quizAttempts.$inferSelect;

/* ---- Podcasts (feature 17) -------------------------------------------------
   A two-voice audio conversation, made only when someone asks, then shared
   by everyone who can see the lesson. One row per (lesson, length,
   language): English, or Hinglish (Hindi in Devanagari mixed with English
   terms). Private notes (feature 19) use noteId instead. `sourceHash` and `promptsVersion`
   describe the audio that is stored and change only when new audio is
   saved, so a regeneration that fails leaves the old episode playable.
   `status` is the latest generation's state. */

export const podcastLengthEnum = pgEnum("podcast_length", ["short", "medium", "long"]);
export type PodcastLength = (typeof podcastLengthEnum.enumValues)[number];
export const podcastLanguageEnum = pgEnum("podcast_language", ["en", "hinglish"]);
export type PodcastLanguage = (typeof podcastLanguageEnum.enumValues)[number];
export const podcastStatusEnum = pgEnum("podcast_status", ["generating", "ready", "failed"]);
export type PodcastStatus = (typeof podcastStatusEnum.enumValues)[number];

export const podcasts = pgTable(
  "podcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    length: podcastLengthEnum("length").notNull(),
    language: podcastLanguageEnum("language").notNull().default("en"),
    script: jsonb("script").$type<PodcastLine[]>().notNull().default([]),
    audioUrl: text("audio_url"),
    audioPathname: text("audio_pathname"),
    durationSec: numeric("duration_sec", { precision: 10, scale: 3, mode: "number" }),
    status: podcastStatusEnum("status").notNull().default("generating"),
    error: text("error"),
    sourceHash: text("source_hash"),
    promptsVersion: integer("prompts_version"),
    /* Who asked for the latest generation; its AI cost is logged to them. */
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("podcasts_lesson_length_language_idx").on(t.lessonId, t.length, t.language),
    uniqueIndex("podcasts_note_length_language_idx").on(t.noteId, t.length, t.language),
  ],
);

export type PodcastRow = typeof podcasts.$inferSelect;

export type ChatThread = typeof chatThreads.$inferSelect;
export type ChatTurn = typeof chatTurns.$inferSelect;

/* ---- Documents (feature 18) -------------------------------------------------
   A PDF, DOCX, web page, recording or YouTube video attached to a lesson
   (or, in feature 19, owned by a student: the source of one private note,
   `noteId`, and readable only by its owner). The task extracts its text into
   `parts` (per page, section or time), which retrieval chunks and citations
   point back to. On a reading lesson the documents are the source of the
   AI drafts; on other lessons they are resources. Students see a document
   once it's ready and the lesson is visible to them. */

export const documentKindEnum = pgEnum("document_kind", ["pdf", "docx", "url", "audio", "youtube"]);
export type DocumentKind = (typeof documentKindEnum.enumValues)[number];
export const documentStatusEnum = pgEnum("document_status", ["uploading", "processing", "ready", "failed"]);
export type DocumentStatus = (typeof documentStatusEnum.enumValues)[number];

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    kind: documentKindEnum("kind").notNull(),
    /* Shown in Resources and in citation chips: "Week 2 slides · p. 7". */
    title: text("title").notNull(),
    filename: text("filename"),
    blobUrl: text("blob_url"),
    pathname: text("pathname"),
    /* The source link for url and youtube documents. */
    url: text("url"),
    contentType: text("content_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    pageCount: integer("page_count"),
    durationSec: numeric("duration_sec", { precision: 10, scale: 3, mode: "number" }),
    text: text("text").notNull().default(""),
    parts: jsonb("parts").$type<DocPart[]>().notNull().default([]),
    status: documentStatusEnum("status").notNull().default("uploading"),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("documents_lesson_idx").on(t.lessonId, t.createdAt),
    index("documents_owner_idx").on(t.ownerId),
    index("documents_note_idx").on(t.noteId),
    check("documents_lesson_or_owner", sql`(${t.lessonId} is null) <> (${t.ownerId} is null)`),
  ],
);

export type DocumentRow = typeof documents.$inferSelect;

/* ---- Coursework (feature 20) ------------------------------------------------
   An assignment lesson has one `assignments` row (its instructions, due
   date and points). A student hands in once per assignment and may replace
   the submission until it's graded; `late` is decided by the server clock
   when it's handed in. Files go straight from the browser to Blob under
   submissions/{assignmentId}/{userId}/ and are opened only through
   /submissions/[id]/files/[n], which checks access first.

   Status: `submitted` waits in the grading queue; `graded` has a draft
   grade the student can't see yet; `returned` means the grade and feedback
   are the student's to read. Submissions and grades are never deleted by
   the app (the lesson can't be deleted while it has any), only by
   demo:reset. A quiz's grade is its best attempt × points, read from
   quiz_attempts; `gradedQuizAttemptId` is there for a grade row an
   instructor sets on an attempt (not built yet). */

export const assignmentCategoryEnum = pgEnum("assignment_category", ["homework", "project", "quiz", "exam"]);
export type AssignmentCategory = (typeof assignmentCategoryEnum.enumValues)[number];
export const ASSIGNMENT_CATEGORIES = assignmentCategoryEnum.enumValues;

export const submissionStatusEnum = pgEnum("submission_status", ["submitted", "graded", "returned"]);
export type SubmissionStatus = (typeof submissionStatusEnum.enumValues)[number];

/* A file handed in with a submission. `name` is the student's own file
   name, shown in the grade view; the pathname is checked on hand-in. */
export interface SubmissionFile {
  url: string;
  pathname: string;
  name: string;
  contentType: string;
  size: number;
}

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    /* Markdown, rendered sanitized. */
    instructions: text("instructions").notNull().default(""),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    points: integer("points").notNull(),
    allowLate: boolean("allow_late").notNull().default(false),
    category: assignmentCategoryEnum("category").notNull().default("homework"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("assignments_lesson_idx").on(t.lessonId)],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /* No cascade: deleting an assignment that has work fails. */
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull().default(""),
    files: jsonb("files").$type<SubmissionFile[]>().notNull().default([]),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    late: boolean("late").notNull().default(false),
    status: submissionStatusEnum("status").notNull().default("submitted"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("submissions_assignment_user_idx").on(t.assignmentId, t.userId),
    index("submissions_user_idx").on(t.userId),
    index("submissions_queue_idx").on(t.status, t.submittedAt),
  ],
);

export const grades = pgTable(
  "grades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "cascade" }),
    gradedQuizAttemptId: uuid("graded_quiz_attempt_id").references(() => quizAttempts.id, { onDelete: "cascade" }),
    /* The student the grade belongs to. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    score: numeric("score", { precision: 8, scale: 2, mode: "number" }).notNull(),
    /* The points it was out of when graded. */
    maxScore: integer("max_score").notNull(),
    /* Markdown, rendered sanitized. */
    feedback: text("feedback").notNull().default(""),
    gradedBy: uuid("graded_by").references(() => users.id, { onDelete: "set null" }),
    gradedAt: timestamp("graded_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("grades_submission_idx").on(t.submissionId),
    uniqueIndex("grades_quiz_attempt_idx").on(t.gradedQuizAttemptId),
    index("grades_user_idx").on(t.userId),
    check("grades_one_source", sql`num_nonnulls(${t.submissionId}, ${t.gradedQuizAttemptId}) = 1`),
    check("grades_score_range", sql`${t.score} >= 0 and ${t.score} <= ${t.maxScore}`),
  ],
);

/* Category weights for a course's gradebook total. The scheme is still an
   open question, so a course without rows weighs its categories equally. */
export const gradeCategories = pgTable(
  "grade_categories",
  {
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    category: assignmentCategoryEnum("category").notNull(),
    weight: numeric("weight", { precision: 6, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.category] }), check("grade_categories_weight", sql`${t.weight} >= 0`)],
);

export type Assignment = typeof assignments.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Grade = typeof grades.$inferSelect;

/* ---- Communication (feature 21) ----------------------------------------------
   The course's time and social layer. Everything here belongs to a course,
   and is read through the same rule as its lessons: course staff (admins
   included) see all of it; a student sees it while actively enrolled in
   the published course, and, for something tied to a lesson, only while
   that lesson and its module are published. Checked in the SQL of
   lib/db/events.ts, announcements.ts and discussions.ts. */

export const eventKindEnum = pgEnum("event_kind", ["due", "live", "quiz", "custom"]);
export type EventKind = (typeof eventKindEnum.enumValues)[number];

/* A dated entry on the course calendar. `due` and `quiz` are written by
   saving an assignment or creating a graded quiz (sourceId = the
   assignment or graded quiz, one event each); `live` (an external meeting
   link) and `custom` are added by staff. `lessonId` is the lesson a due
   date or quiz belongs to: its visibility gates the event, and deleting
   the lesson deletes it. `url` is an in-app path, or an https link. */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    kind: eventKindEnum("kind").notNull(),
    title: text("title").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    url: text("url"),
    sourceId: uuid("source_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("events_course_at_idx").on(t.courseId, t.at), uniqueIndex("events_source_idx").on(t.kind, t.sourceId)],
);

/* Posted by course staff; enrolled students read them on the course page
   and get a notification. `body` is Markdown, rendered without raw HTML. */
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_course_idx").on(t.courseId, t.createdAt)],
);

export const discussionStatusEnum = pgEnum("discussion_status", ["open", "answered"]);
export type DiscussionStatus = (typeof discussionStatusEnum.enumValues)[number];

/* A question thread in a course, optionally about one lesson. The whole
   class can read and reply; only staff mark a reply as the answer, which
   makes the thread `answered` (an open thread is an "unanswered
   question"). Deleting the lesson keeps the thread in the course. */
export const discussions = pgTable(
  "discussions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: discussionStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("discussions_course_idx").on(t.courseId, t.createdAt),
    index("discussions_lesson_idx").on(t.lessonId),
    index("discussions_author_idx").on(t.authorId),
  ],
);

/* At most one reply per thread is the answer (partial unique index). */
export const discussionReplies = pgTable(
  "discussion_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discussionId: uuid("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    isAnswer: boolean("is_answer").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("discussion_replies_discussion_idx").on(t.discussionId, t.createdAt),
    uniqueIndex("discussion_replies_one_answer_idx").on(t.discussionId).where(sql`is_answer`),
  ],
);

export const notificationKindEnum = pgEnum("notification_kind", ["grade_returned", "announcement", "discussion_reply", "due_soon"]);
export type NotificationKind = (typeof notificationKindEnum.enumValues)[number];

/* In-app only (no email, no push). Personal: only the recipient reads
   them. `url` is always an in-app path. `dedupeKey` marks a notice that
   must not be sent twice (the daily due-soon run): unique per user. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_user_dedupe_idx").on(t.userId, t.dedupeKey),
  ],
);

export type CalendarEventRow = typeof events.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Discussion = typeof discussions.$inferSelect;
export type DiscussionReply = typeof discussionReplies.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;

/* ---- Invitations (feature 22) ------------------------------------------------
   Someone invited from the Users page or a roster import who has no
   account yet. Clerk sends the invitation (with the role in its public
   metadata); this row remembers what they were invited to. When they first
   sign in, syncUserFromClerk turns their pending rows into enrollments
   (students) or course_staff rows (instructors) and sets acceptedAt. One
   row per (email, course); courseId is null for an invitation to the
   university with no course. Emails are stored lowercase. */

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    clerkInvitationId: text("clerk_invitation_id"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [unique("invitations_email_course_key").on(t.email, t.courseId).nullsNotDistinct(), index("invitations_email_idx").on(t.email)],
);

export type Invitation = typeof invitations.$inferSelect;
