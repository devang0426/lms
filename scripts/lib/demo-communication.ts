import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { announcements, discussions, lessons, modules } from "@/lib/db/schema";

/* The demo's communication layer (feature 21). `npm run db:seed` posts a
   welcome announcement in the demo course (students read it on the course
   page) and one open question from the Demo Student, so the instructor
   dashboard's "Unanswered questions" isn't empty at demo step 1.
   `npm run demo:reset` deletes the student's threads and puts that
   question back. Neither sends notifications: the bell starts empty, so
   the reply notification in demo step 6 is the one that shows. */

const WELCOME = {
  title: "Welcome to MATH 201",
  body: `Welcome, everyone! Lectures go up each week with notes, flashcards and a practice quiz.

- **Problem set 1** is on the calendar: hand it in from its lesson page.
- Stuck? Ask the course assistant first. If it can't help, press **Ask your instructor** and I'll answer in Discussions.

See you in class. — Prof. Rao`,
};

const QUESTION = {
  lessonTitle: "Linear combinations and span",
  title: "Why is the span of two parallel vectors only a line?",
  body: `In the lecture, $(1, 2)$ and $(2, 4)$ only span a line, but I don't see why two vectors can't reach the whole plane. What makes them "parallel" in the maths?`,
};

export async function ensureDemoAnnouncement(courseId: string, adminId: string): Promise<"created" | "kept"> {
  const [existing] = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(and(eq(announcements.courseId, courseId), eq(announcements.title, WELCOME.title)))
    .limit(1);
  if (existing) return "kept";
  await db.insert(announcements).values({ courseId, authorId: adminId, ...WELCOME });
  return "created";
}

/* The Demo Student's open question about the seeded lecture. Left alone
   if they already asked it (answered or not). */
export async function ensureDemoQuestion(courseId: string, studentId: string): Promise<"created" | "kept"> {
  const [existing] = await db
    .select({ id: discussions.id })
    .from(discussions)
    .where(and(eq(discussions.courseId, courseId), eq(discussions.authorId, studentId), eq(discussions.title, QUESTION.title)))
    .limit(1);
  if (existing) return "kept";
  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(eq(modules.courseId, courseId), eq(lessons.title, QUESTION.lessonTitle)))
    .limit(1);
  await db.insert(discussions).values({
    courseId,
    lessonId: lesson?.id ?? null,
    authorId: studentId,
    title: QUESTION.title,
    body: QUESTION.body,
    // An hour ago, so it's the oldest waiting when the demo asks its own.
    createdAt: new Date(Date.now() - 3_600_000),
  });
  return "created";
}
