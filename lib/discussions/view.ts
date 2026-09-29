import type { Role } from "@/lib/db/schema";

/* Course discussions (feature 21). Pure: limits, where a thread opens for
   a given role, and the draft "Ask your instructor" starts from. */

export const DISCUSSION_LIMITS = { title: 140, body: 10_000 } as const;

/* Students read threads in their sidebar shell; staff in Messages. */
export function discussionHref(discussionId: string, role: Role): string {
  return role === "student" ? `/discussions/${discussionId}` : `/instructor/messages/${discussionId}`;
}

/* The assistant refused a question: start a thread from it. The title is
   the question (cut to fit), the body keeps it whole with a line of
   context for the instructor. The student can edit both. */
export function draftFromQuestion(question: string): { title: string; body: string } {
  const q = question.trim().replace(/\s+/g, " ");
  const title = q.length <= DISCUSSION_LIMITS.title ? q : `${q.slice(0, DISCUSSION_LIMITS.title - 1).trimEnd()}…`;
  const body = q ? `${question.trim()}\n\nThe course assistant couldn't find this in the course material.` : "";
  return { title, body };
}
