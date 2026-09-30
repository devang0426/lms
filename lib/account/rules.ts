import type { ExportStatus, JobStatus } from "@/lib/db/schema";

/* Data export and account deletion (feature 33): the rules, pure and
   shared with the Profile page and the admin dialog. */

/* An export's file can be downloaded for 7 days after it's asked for;
   the daily prune-old-rows then deletes it. */
export const EXPORT_DAYS = 7;

/* Requests per person per 24 hours, counted in the same locked batch as
   the insert (lib/db/limits.ts), so parallel clicks can't pass it. */
export const EXPORT_DAILY_LIMIT = 3;

export const EXPORT_LIMIT_MESSAGE = `You can ask for your data ${EXPORT_DAILY_LIMIT} times a day. Try again tomorrow.`;

/* What an erased account is called wherever its kept records show it. */
export const DELETED_USER_NAME = "Deleted user";

/* A deleted account whose erase hasn't finished this long after the
   delete is picked up by the daily clean-up, which erases it itself. */
export const ERASE_SWEEP_AFTER_MS = 60 * 60 * 1000;
export const ERASE_SWEEP_BATCH = 20;

export function exportExpiresAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + EXPORT_DAYS * 86_400_000);
}

/* The admin's Delete user dialog: the person's email, typed. Case and
   surrounding spaces don't matter; an account with no email can't be
   confirmed this way. */
export function confirmsDeletion(typed: string, email: string): boolean {
  const want = email.trim().toLowerCase();
  return want.length > 0 && typed.trim().toLowerCase() === want;
}

/* What the Delete user dialog says happens (lib/db/user-erase.ts does it). */
export const ERASED_ITEMS = [
  "Their private notes and uploads",
  "Assistant chats, lesson notes, flashcard reviews and watch progress",
  "Practice quiz attempts, notifications and data exports",
  "Their name, email and picture",
] as const;

export const KEPT_ITEMS = [
  "Submissions, grades and graded quiz attempts",
  "Discussion posts, shown as “Deleted user”",
  "Course content they made, and the audit log",
] as const;

/* Why this admin may not delete this account, or null. Checked by the
   action; the dialog shows the same words. */
export function deleteRefusal(target: { id: string; email: string }, admin: { id: string }, demo: { on: boolean; emails: readonly string[] }): string | null {
  if (target.id === admin.id) return "You can't delete your own account here. Ask another admin.";
  if (demo.on && demo.emails.includes(target.email.toLowerCase())) return "The demo accounts can't be deleted in demo mode.";
  return null;
}

/* ---- The Profile page's "Your data" card ------------------------------------ */

export type ExportPhase =
  | { phase: "none" }
  | { phase: "building" }
  | { phase: "ready"; expiresAt: Date; sizeBytes: number | null }
  | { phase: "failed"; message: string };

export const EXPORT_FAILED_MESSAGE = "Your file couldn't be prepared. Try again.";

/* The newest export, read with its run: a row still "building" whose run
   has ended (a crash skips the task's hooks) counts as failed, so the
   button comes back. An expired file counts as none. */
export function exportPhase(
  latest: { status: ExportStatus; expiresAt: Date; sizeBytes: number | null; error: string | null } | null,
  job: { status: JobStatus } | null,
  now: Date,
): ExportPhase {
  if (!latest || latest.expiresAt <= now) return { phase: "none" };
  switch (latest.status) {
    case "ready":
      return { phase: "ready", expiresAt: latest.expiresAt, sizeBytes: latest.sizeBytes };
    case "failed":
      return { phase: "failed", message: latest.error ?? EXPORT_FAILED_MESSAGE };
    case "building":
      return job && (job.status === "failed" || job.status === "canceled" || job.status === "completed")
        ? { phase: "failed", message: EXPORT_FAILED_MESSAGE }
        : { phase: "building" };
    default: {
      const never: never = latest.status;
      throw new Error(`Unknown export status ${String(never)}`);
    }
  }
}

/* "84 KB", "1.2 MB". */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
