/* Demo reset (feature 03). Run before a rehearsal or the real demo:
     npm run demo:reset
   - signs out every open session of the demo accounts (clean browser state)
   - restores their role, name and password (DEMO_ACCOUNT_PASSWORD)
   - clears the Demo Student's activity, keeping all course content

   Later features register their student-activity cleanup in RESET_STEPS:
   watch progress & notes (11), card reviews (15), quiz attempts (16),
   chats (14), private space (19), submissions & grades (20),
   notifications & discussions (21). */

import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chatThreads, lessonNotes, users, watchProgress, type User } from "@/lib/db/schema";
import { DEMO_ACCOUNTS, ensureDemoClerkUser, isDemoMode } from "@/lib/demo/accounts";

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
    // Turns go with their thread (cascade).
    label: "Assistant chats",
    run: async (s) => (await db.delete(chatThreads).where(eq(chatThreads.userId, s.id)).returning()).length,
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
