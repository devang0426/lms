/* Demo reset (feature 03). Run before a rehearsal or the real demo:
     npm run demo:reset
   - signs out every open session of the demo accounts (clean browser state)
   - restores their role, name and password (DEMO_ACCOUNT_PASSWORD)
   - clears the Demo Student's activity, keeping all course content

   Later features register their student-activity cleanup in RESET_STEPS:
   watch progress & notes (11), card reviews (15), quiz attempts (16),
   chats (14), podcasts the student asked for (17), private space (19), submissions & grades (20),
   notifications & discussions (21). */

import { createClerkClient } from "@clerk/backend";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  cardReviews,
  chatThreads,
  courses,
  discussionReplies,
  discussions,
  documents,
  lessonNotes,
  notes,
  notifications,
  podcasts,
  quizAttempts,
  submissions,
  users,
  watchProgress,
  type User,
} from "@/lib/db/schema";
import { deleteBlobs } from "@/lib/storage/blob";
import { DEMO_ACCOUNTS, ensureDemoClerkUser, isDemoMode } from "@/lib/demo/accounts";
import { DEMO_COURSE_CODE, ensureDemoSubmission } from "./lib/demo-assignment";
import { ensureDemoQuestion } from "./lib/demo-communication";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

type ResetStep = { label: string; run: (student: User) => Promise<number> };

/* Each step deletes the demo student's rows from one feature's activity
   tables and returns how many rows it removed. */
const RESET_STEPS: ResetStep[] = [
  {
    label: "Watch progress",
    run: async (s) => (await db.delete(watchProgress).where(eq(watchProgress.userId, s.id)).returning()).length,
  },
  {
    label: "Lesson notes",
    run: async (s) => (await db.delete(lessonNotes).where(eq(lessonNotes.userId, s.id)).returning()).length,
  },
  {
    label: "Flashcard reviews",
    run: async (s) => (await db.delete(cardReviews).where(eq(cardReviews.userId, s.id)).returning()).length,
  },
  {
    // Answers go with their attempt (cascade). Graded quizzes stay: they're the instructor's.
    label: "Quiz attempts",
    run: async (s) => (await db.delete(quizAttempts).where(eq(quizAttempts.userId, s.id)).returning()).length,
  },
  {
    // Turns go with their thread (cascade).
    label: "Assistant chats",
    run: async (s) => (await db.delete(chatThreads).where(eq(chatThreads.userId, s.id)).returning()).length,
  },
  {
    // Podcasts are shared, but one the demo student generated goes, so the
    // demo's "Generate podcast" step starts from scratch. Its MP3 goes too.
    label: "Podcasts generated",
    run: async (s) => {
      const gone = await db.delete(podcasts).where(eq(podcasts.requestedBy, s.id)).returning({ audioUrl: podcasts.audioUrl });
      await deleteBlobs(gone.flatMap((p) => (p.audioUrl ? [p.audioUrl] : [])));
      return gone.length;
    },
  },
  {
    // The private space (feature 19): the student's notes go with everything
    // made from them (cascade: their source documents, cards, questions,
    // chunks, chats and podcasts), and the uploads and MP3s leave Blob, so
    // demo step 8 starts from an empty space.
    label: "Private space",
    run: async (s) => {
      const [files, casts] = await db.batch([
        db.select({ url: documents.blobUrl }).from(documents).where(eq(documents.ownerId, s.id)),
        db
          .select({ url: podcasts.audioUrl })
          .from(podcasts)
          .innerJoin(notes, eq(notes.id, podcasts.noteId))
          .where(eq(notes.ownerId, s.id)),
      ]);
      const gone = await db.delete(notes).where(eq(notes.ownerId, s.id)).returning({ id: notes.id });
      await db.delete(documents).where(eq(documents.ownerId, s.id));
      await deleteBlobs([...files, ...casts].flatMap((f) => (f.url ? [f.url] : [])));
      return gone.length;
    },
  },
  {
    // Grades go with their submission (cascade), and handed-in files are
    // deleted. Then the seeded, ungraded submission is put back, so demo
    // step 9 always has work waiting in the grading queue.
    label: "Submissions + grades",
    run: async (s) => {
      const gone = await db.delete(submissions).where(eq(submissions.userId, s.id)).returning({ files: submissions.files });
      await deleteBlobs(gone.flatMap((g) => g.files.map((f) => f.url)));
      await ensureDemoSubmission(s.id);
      return gone.length;
    },
  },
  {
    // Feature 21: the student's threads go (replies with them, the
    // instructor's included), and their replies elsewhere. Then the seeded
    // open question is put back for the dashboard's "Unanswered questions".
    label: "Discussions",
    run: async (s) => {
      const gone = await db.delete(discussions).where(eq(discussions.authorId, s.id)).returning({ id: discussions.id });
      await db.delete(discussionReplies).where(eq(discussionReplies.authorId, s.id));
      const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, DEMO_COURSE_CODE)).limit(1);
      if (course) await ensureDemoQuestion(course.id, s.id);
      return gone.length;
    },
  },
  {
    // Both demo accounts' bells start empty. Announcements are course
    // content and stay.
    label: "Notifications",
    run: async () => {
      const demo = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.email, DEMO_ACCOUNTS.map((a) => a.email)));
      if (demo.length === 0) return 0;
      const gone = await db
        .delete(notifications)
        .where(inArray(notifications.userId, demo.map((u) => u.id)))
        .returning({ id: notifications.id });
      return gone.length;
    },
  },
];

async function resetAccounts() {
  for (const account of DEMO_ACCOUNTS) {
    const u = await ensureDemoClerkUser(clerk, account, { resetPassword: true });
    await clerk.users.updateUser(u.id, { firstName: account.firstName, lastName: account.lastName });

    const { data: sessions } = await clerk.sessions.getSessionList({ userId: u.id, status: "active" });
    await Promise.all(sessions.map((s) => clerk.sessions.revokeSession(s.id)));

    await db
      .insert(users)
      .values({
        clerkId: u.id,
        email: account.email,
        name: `${account.firstName} ${account.lastName}`,
        imageUrl: u.imageUrl,
        role: account.role,
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: {
          email: account.email,
          name: `${account.firstName} ${account.lastName}`,
          role: account.role,
          deletedAt: null,
        },
      });

    console.log(
      `  ✓ ${account.label.padEnd(20)} restored, ${sessions.length} session(s) signed out`,
    );
  }
}

async function resetStudentActivity() {
  const email = DEMO_ACCOUNTS.find((a) => a.key === "student")!.email;
  const [student] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!student) throw new Error("Demo student row missing — run `npm run db:seed` first.");

  if (RESET_STEPS.length === 0) {
    console.log("  · No student activity to clear yet (added by features 11+)");
    return;
  }
  for (const step of RESET_STEPS) {
    const n = await step.run(student);
    console.log(`  ✓ ${step.label.padEnd(20)} ${n} row(s) cleared`);
  }
}

async function main() {
  if (!isDemoMode()) {
    console.error("Refusing to reset: DEMO_MODE is not \"true\" in .env.local.");
    process.exit(1);
  }
  console.log("Resetting Studyhall demo…");
  await resetAccounts();
  await resetStudentActivity();
  console.log("Done. Course content was left untouched.");
}

main().catch((err) => {
  console.error("Reset failed:", err?.errors ?? err);
  process.exit(1);
});
