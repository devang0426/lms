/* Drizzle schema — base tables (feature 02). Later features add their own
   tables here; see context/architecture.md → Storage Model. */

import {
  bigint,
  boolean,
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
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Block } from "@/lib/ai/types";
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
   have ownerId set and no lessonId. `blocks` is the editor model from
   lib/markdown.ts; a heading block may carry `startSec`. */
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
  (t) => [uniqueIndex("notes_lesson_idx").on(t.lessonId), index("notes_owner_idx").on(t.ownerId)],
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
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_threads_user_idx").on(t.userId, t.courseId, t.createdAt)],
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

export type ChatThread = typeof chatThreads.$inferSelect;
export type ChatTurn = typeof chatTurns.$inferSelect;
