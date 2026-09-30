/* Demo seed (feature 03). Idempotent: run it any number of times.
   Run with `npm run db:seed` — which loads .env.local and uses the
   react-server condition so `server-only` modules can be imported here.

   Later features extend this file at the marked sections:
   seedCourse() (07), seedLecture() (12), seedAssignment() (20),
   seedCommunication() (21). */

import { createClerkClient } from "@clerk/backend";
import { and, eq, inArray, sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { indexLessonChunks } from "@/lib/ai/retrieval/index-lesson";
import type { Block } from "@/lib/ai/types";
import { countLessonChunks } from "@/lib/db/chunks";
import { db } from "@/lib/db/client";
import { publishLessonStatements } from "@/lib/db/lesson-content";
import {
  chapters,
  courses,
  courseStaff,
  enrollments,
  flashcards,
  lessons,
  modules,
  notes,
  quizQuestions,
  sections,
  terms,
  transcriptSegments,
  users,
  videos,
  type LessonKind,
  type LessonStatus,
  type PublishStatus,
} from "@/lib/db/schema";
import { DEMO_ACCOUNTS, ensureDemoClerkUser } from "@/lib/demo/accounts";
import { DEMO_COURSE_CODE, ensureDemoAssignment, ensureDemoSubmission } from "./lib/demo-assignment";
import { ensureDemoAnnouncement, ensureDemoQuestion } from "./lib/demo-communication";
import { LECTURE_FIXTURE_PATH, lectureFixture } from "./lib/lecture-fixture";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function seedDemoUsers() {
  for (const account of DEMO_ACCOUNTS) {
    const u = await ensureDemoClerkUser(clerk, account, { resetPassword: true });
    const name = `${u.firstName ?? account.firstName} ${u.lastName ?? account.lastName}`.trim();
    await db
      .insert(users)
      .values({ clerkId: u.id, email: account.email, name, imageUrl: u.imageUrl, role: account.role })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: { email: account.email, name, imageUrl: u.imageUrl, role: account.role, deletedAt: null },
      });
    console.log(`  ✓ ${account.label.padEnd(20)} ${account.email}`);
  }
}

async function seedTerm(): Promise<string> {
  const name = "Autumn 2026";
  const [existing] = await db.select().from(terms).where(eq(terms.name, name)).limit(1);
  let termId: string;
  if (existing) {
    if (!existing.isCurrent) await db.update(terms).set({ isCurrent: true }).where(eq(terms.id, existing.id));
    termId = existing.id;
  } else {
    const [row] = await db
      .insert(terms)
      .values({ name, startsOn: "2026-08-17", endsOn: "2026-12-18", isCurrent: true })
      .returning({ id: terms.id });
    termId = row.id;
  }
  console.log(`  ✓ Term                 ${name} (current)`);
  return termId;
}

/* The demo course (feature 07). Subject and course are still open
   questions in progress-tracker.md — change them here. Course details,
   the section, staff and enrollment are re-applied every run. The
   curriculum is only created when the course has no modules, so edits made
   in the course builder survive a re-seed. */
const DEMO_COURSE = {
  code: DEMO_COURSE_CODE,
  title: "Linear Algebra",
  subject: "Mathematics",
  level: "Intermediate",
  coverTint: "clay" as const,
  summary:
    "Vectors, matrices and the linear maps between them, taught slowly and with pictures. By the end you can read and use the language behind graphics, data science and machine learning.",
  outcomes: [
    "Work with vectors, span and linear independence",
    "Multiply, invert and factor matrices by hand",
    "Solve linear systems and explain when they have no solution",
    "Find eigenvalues and eigenvectors and use them to diagonalise",
  ],
};

type SeedLesson = { title: string; kind: LessonKind; durationSec: number | null; status: LessonStatus };
type SeedModule = { title: string; status: PublishStatus; lessons: SeedLesson[] };

/* Placeholder lessons. Feature 12 puts the processed lecture into one
   (seedLecture publishes it). A video lesson goes live only with a ready
   video (feature 27), so the others stay drafts, and so does the Matrices
   module, which has nothing published yet. Quiz is no longer a lesson type
   teachers can add, so the practice set is a reading lesson. */
const DEMO_CURRICULUM: SeedModule[] = [
  {
    title: "Vectors and spaces",
    status: "published",
    lessons: [
      { title: "What is a vector?", kind: "video", durationSec: 720, status: "draft" },
      { title: "Linear combinations and span", kind: "video", durationSec: 900, status: "draft" },
      { title: "Notation guide", kind: "reading", durationSec: 300, status: "published" },
    ],
  },
  {
    title: "Matrices",
    status: "draft",
    lessons: [
      { title: "Matrix multiplication", kind: "video", durationSec: 840, status: "draft" },
      { title: "Inverses and determinants", kind: "video", durationSec: 960, status: "draft" },
      { title: "Practice set", kind: "reading", durationSec: null, status: "draft" },
    ],
  },
  {
    title: "Eigenvalues",
    status: "draft",
    lessons: [
      { title: "Eigenvectors, visually", kind: "video", durationSec: 780, status: "draft" },
      { title: "Diagonalisation", kind: "video", durationSec: 1020, status: "draft" },
    ],
  },
];

async function demoUserId(key: "admin" | "student"): Promise<string> {
  const email = DEMO_ACCOUNTS.find((a) => a.key === key)!.email;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!row) throw new Error(`Demo ${key} row missing.`);
  return row.id;
}

async function seedCourse(termId: string) {
  const { code, ...details } = DEMO_COURSE;
  const [course] = await db
    .insert(courses)
    .values({ termId, code, status: "published", ...details })
    .onConflictDoUpdate({ target: [courses.termId, courses.code], set: { ...details, status: "published" } })
    .returning({ id: courses.id });

  const [section] = await db
    .insert(sections)
    .values({ courseId: course.id, name: "Section A" })
    .onConflictDoUpdate({ target: [sections.courseId, sections.name], set: { name: "Section A" } })
    .returning({ id: sections.id });

  const [adminId, studentId] = await Promise.all([demoUserId("admin"), demoUserId("student")]);
  await db.batch([
    db
      .insert(courseStaff)
      .values({ courseId: course.id, userId: adminId, role: "instructor" })
      .onConflictDoUpdate({ target: [courseStaff.courseId, courseStaff.userId], set: { role: "instructor" } }),
    db
      .insert(enrollments)
      .values({ sectionId: section.id, userId: studentId, status: "active" })
      .onConflictDoUpdate({ target: [enrollments.sectionId, enrollments.userId], set: { status: "active" } }),
  ]);

  const existing = await db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, course.id)).limit(1);
  if (existing.length === 0) {
    for (const [position, m] of DEMO_CURRICULUM.entries()) {
      const [mod] = await db
        .insert(modules)
        .values({ courseId: course.id, position, title: m.title, status: m.status })
        .returning({ id: modules.id });
      await db.insert(lessons).values(
        m.lessons.map((l, i) => ({
          moduleId: mod.id,
          position: i,
          ...l,
          publishedAt: l.status === "published" ? new Date() : null,
        })),
      );
    }
    console.log(`  ✓ Course               ${code} · ${DEMO_COURSE.title} (curriculum created)`);
  } else {
    console.log(`  ✓ Course               ${code} · ${DEMO_COURSE.title} (curriculum kept)`);
  }
  console.log("  ✓ Staff + enrollment   Prof. Meera Rao teaches, Aanya Sharma enrolled (Section A)");
  return course.id;
}

/* The processed demo lecture (feature 12), from the fixture that
   `npm run demo:export-lecture` writes. It goes into the demo lesson named
   in the fixture: video, transcript, chapters, notes, cards and quiz, all
   published. Loaded once — a re-run keeps the instructor's edits and only
   makes sure everything is still published. */
async function seedLecture(courseId: string) {
  if (!existsSync(LECTURE_FIXTURE_PATH)) {
    console.log(`  · Lecture              skipped (no ${LECTURE_FIXTURE_PATH}; run npm run demo:export-lecture)`);
    return;
  }
  const fixture = lectureFixture.parse(JSON.parse(await readFile(LECTURE_FIXTURE_PATH, "utf8")));
  const [target] = await db
    .select({ id: lessons.id, moduleId: lessons.moduleId })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(eq(modules.courseId, courseId), eq(lessons.title, fixture.lessonTitle)))
    .limit(1);
  if (!target) {
    console.log(`  · Lecture              skipped (no lesson titled "${fixture.lessonTitle}" in the demo course)`);
    return;
  }

  const [loaded] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.lessonId, target.id), eq(videos.blobUrl, fixture.video.blobUrl), eq(videos.status, "ready")))
    .limit(1);

  if (!loaded) {
    const adminId = await demoUserId("admin");
    // The lesson's earlier videos (rows only: blobs belong to their uploads)
    // and content make way for the fixture. Segments cascade.
    await db.batch([
      db.delete(videos).where(eq(videos.lessonId, target.id)),
      db.delete(chapters).where(eq(chapters.lessonId, target.id)),
      db.delete(notes).where(eq(notes.lessonId, target.id)),
      db.delete(flashcards).where(eq(flashcards.lessonId, target.id)),
      db.delete(quizQuestions).where(eq(quizQuestions.lessonId, target.id)),
    ]);
    const [video] = await db
      .insert(videos)
      .values({ lessonId: target.id, ...fixture.video, faststart: true, status: "ready", createdBy: adminId })
      .returning({ id: videos.id });
    const lessonId = target.id;
    const generated = { lessonId, videoId: video.id, promptsVersion: fixture.promptsVersion };
    const [note] = fixture.note
      ? await db
          .insert(notes)
          .values({ ...generated, title: fixture.note.title, blocks: fixture.note.blocks as unknown as Block[], status: "published" })
          .returning({ id: notes.id })
      : [];
    const noteId = note?.id ?? null;

    const inserts = [];
    for (let i = 0; i < fixture.segments.length; i += 500) {
      inserts.push(
        db.insert(transcriptSegments).values(
          fixture.segments.slice(i, i + 500).map((s, j) => ({ lessonId, videoId: video.id, idx: i + j, ...s })),
        ),
      );
    }
    if (fixture.chapters.length) {
      inserts.push(db.insert(chapters).values(fixture.chapters.map((c, position) => ({ ...generated, position, ...c }))));
    }
    if (fixture.cards.length) {
      inserts.push(
        db.insert(flashcards).values(fixture.cards.map((c, position) => ({ ...generated, noteId, position, status: "published" as const, ...c }))),
      );
    }
    if (fixture.questions.length) {
      inserts.push(
        db.insert(quizQuestions).values(
          fixture.questions.map((q, position) => ({ ...generated, noteId, position, status: "published" as const, ...q })),
        ),
      );
    }
    const [first, ...rest] = inserts;
    if (first) await db.batch([first, ...rest]);
  }

  await db.batch([
    ...publishLessonStatements(target.id),
    db
      .update(lessons)
      .set({ kind: "video", durationSec: Math.round(fixture.video.durationSec) })
      .where(eq(lessons.id, target.id)),
    db.update(modules).set({ status: "published" }).where(eq(modules.id, target.moduleId)),
  ]);
  console.log(
    `  ✓ Lecture              "${fixture.lessonTitle}" ${loaded ? "(kept, published)" : "(loaded and published)"}: ` +
      `${fixture.chapters.length} chapters, ${fixture.cards.length} cards, ${fixture.questions.length} questions`,
  );
  await seedLectureIndex(target.id, !loaded);
}

/* Feature 27 (V4): a video lesson is published only with a ready video.
   Seeds before it published three placeholder video lessons with none, and
   the curriculum is kept between runs, so every run puts any such lesson
   in the demo course back to draft. A module left with nothing published
   goes back to draft with them, so students don't see an empty module. */
async function draftVideoLessonsWithoutVideo(courseId: string) {
  const drafted = await db
    .update(lessons)
    .set({ status: "draft", publishedAt: null })
    .where(
      and(
        eq(lessons.kind, "video"),
        eq(lessons.status, "published"),
        inArray(lessons.moduleId, db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, courseId))),
        sql`not exists (select 1 from videos v where v.lesson_id = lessons.id and v.status = 'ready')`,
      ),
    )
    .returning({ title: lessons.title, moduleId: lessons.moduleId });
  const touched = [...new Set(drafted.map((l) => l.moduleId))];
  const emptied = touched.length
    ? await db
        .update(modules)
        .set({ status: "draft" })
        .where(
          and(
            inArray(modules.id, touched),
            eq(modules.status, "published"),
            sql`not exists (select 1 from lessons l where l.module_id = modules.id and l.status = 'published')`,
          ),
        )
        .returning({ title: modules.title })
    : [];
  console.log(
    drafted.length
      ? `  ✓ Video lessons        ${drafted.map((l) => `"${l.title}"`).join(", ")} back to draft (no video)` +
          (emptied.length ? `; module ${emptied.map((m) => `"${m.title}"`).join(", ")} too` : "")
      : "  ✓ Video lessons        every published one has a video",
  );
}

/* The assistant's index for the lecture (feature 13). Publish normally
   queues the index-lesson task; the seed publishes directly, so it runs the
   same step here. It embeds only when the lecture was just loaded or has no
   chunks (a fraction of a cent). A failure doesn't stop the seed: publish
   the lesson from the review screen later to index it. */
async function seedLectureIndex(lessonId: string, reloaded: boolean) {
  const existing = reloaded ? 0 : await countLessonChunks(lessonId);
  if (existing > 0) {
    console.log(`  ✓ Assistant index      kept (${existing} passages)`);
    return;
  }
  try {
    const result = await indexLessonChunks(lessonId);
    const detail = result.status === "indexed" ? `${result.chunks} passages, ${result.fromSec}–${result.toSec} s` : result.status;
    console.log(`  ✓ Assistant index      ${detail}`);
  } catch (err) {
    console.warn(`  ! Assistant index      skipped: ${err instanceof Error ? err.message : err}`);
  }
}

/* The demo assignment (feature 20): "Problem set 1" in the demo course,
   published, with the Demo Student's work handed in and waiting in the
   grading queue (demo step 9). A re-run keeps edits and any grade. */
async function seedAssignment(courseId: string) {
  const [adminId, studentId] = await Promise.all([demoUserId("admin"), demoUserId("student")]);
  const { assignmentId, created } = await ensureDemoAssignment(courseId, adminId);
  const submission = await ensureDemoSubmission(studentId, assignmentId);
  console.log(
    `  ✓ Assignment           Problem set 1 ${created ? "(created)" : "(kept, published)"}; ` +
      `Aanya's submission ${submission === "created" ? "handed in, ready to grade" : "kept"}`,
  );
}

/* Communication (feature 21): a welcome announcement and one open student
   question for the dashboard's "Unanswered questions". The assignment's
   due date is already on the calendar (seedAssignment writes its event). */
async function seedCommunication(courseId: string) {
  const [adminId, studentId] = await Promise.all([demoUserId("admin"), demoUserId("student")]);
  const announcement = await ensureDemoAnnouncement(courseId, adminId);
  const question = await ensureDemoQuestion(courseId, studentId);
  console.log(`  ✓ Communication        welcome announcement ${announcement}; Aanya's open question ${question}`);
}

async function main() {
  console.log("Seeding Studyhall demo data…");
  await seedDemoUsers();
  const termId = await seedTerm();
  const courseId = await seedCourse(termId);
  await seedLecture(courseId);
  await draftVideoLessonsWithoutVideo(courseId);
  await seedAssignment(courseId);
  await seedCommunication(courseId);
  console.log("Done. Demo password = DEMO_ACCOUNT_PASSWORD in .env.local");
}

main().catch((err) => {
  console.error("Seed failed:", err?.errors ?? err);
  process.exit(1);
});
