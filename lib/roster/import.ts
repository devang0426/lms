import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { clerkUsersByEmail, sendInvitations } from "@/lib/admin/clerk";
import { syncUserFromClerk } from "@/lib/auth/sync";
import { db } from "@/lib/db/client";
import { pendingInvitationKeys, saveInvitationsStatement } from "@/lib/db/invitations";
import { auditLog, courses, courseStaff, enrollments, sections, terms, type Role } from "@/lib/db/schema";
import { usersByEmail } from "@/lib/db/users";
import { parseRoster, type RosterRow } from "./index";

/* The roster import (feature 22), server side. `planRoster` checks every
   row against the database and Clerk and says what would happen; nothing
   is written. `applyRoster` plans again (the browser's preview is never
   trusted) and does it: good rows are applied, bad rows are reported and
   skipped. Admin only: the actions check the role first.

   Per row: a course (by code, in the current term) and, for a student, a
   section (created if the course doesn't have it yet). Someone with an
   account is enrolled (students) or added to the course's staff
   (instructors). Someone who has signed up with Clerk but never opened
   Studyhall is linked first. Anyone else is invited by email; the
   invitation remembers the course, and their first sign-in enrolls them. */

export type RowOutcome = "error" | "skip" | "enroll" | "teach" | "invite";

export interface PlanRow {
  line: number;
  cells: string[];
  outcome: RowOutcome;
  /* What happens, or why not: "Enroll in Section A", "Already enrolled". */
  message: string;
  notes: string[];
}

interface Resolved extends PlanRow {
  row?: RosterRow;
  courseId?: string;
  courseCode?: string;
  sectionName?: string;
  userId?: string;
  linkFromClerk?: boolean;
}

export interface RosterPlan {
  rows: PlanRow[];
  counts: Record<RowOutcome, number>;
}

const roleLabel = (r: Role) => (r === "admin" ? "an admin" : r === "instructor" ? "an instructor" : "a student");

async function resolve(text: string): Promise<{ ok: true; rows: Resolved[] } | { ok: false; error: string }> {
  const parsed = parseRoster(text);
  if (!parsed.ok) return parsed;

  const good = parsed.rows.flatMap((r) => (r.ok ? [r.row] : []));
  const codes = [...new Set(good.map((r) => r.courseCode.toUpperCase()))];
  const emails = [...new Set(good.map((r) => r.email))];

  const [[current], courseRows] = await db.batch([
    db.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true)).limit(1),
    codes.length
      ? db
          .select({ id: courses.id, code: courses.code, termId: courses.termId })
          .from(courses)
          .where(inArray(sql`upper(${courses.code})`, codes))
      : db.select({ id: courses.id, code: courses.code, termId: courses.termId }).from(courses).where(sql`false`),
  ]);
  // A code names one course per term: the current term's, or the only one.
  const courseByCode = new Map<string, { id: string; code: string }>();
  for (const code of codes) {
    const matches = courseRows.filter((c) => c.code.toUpperCase() === code);
    const pick = matches.find((c) => c.termId === current?.id) ?? (matches.length === 1 ? matches[0] : undefined);
    if (pick) courseByCode.set(code, pick);
  }
  const courseIds = [...new Set([...courseByCode.values()].map((c) => c.id))];

  const [accounts, pendingKeys, sectionRows, enrolled, teaching] = await Promise.all([
    usersByEmail(emails),
    pendingInvitationKeys(emails),
    courseIds.length ? db.select().from(sections).where(inArray(sections.courseId, courseIds)) : Promise.resolve([]),
    courseIds.length
      ? db
          .select({ userId: enrollments.userId, courseId: sections.courseId, section: sections.name })
          .from(enrollments)
          .innerJoin(sections, eq(sections.id, enrollments.sectionId))
          .where(and(inArray(sections.courseId, courseIds), eq(enrollments.status, "active")))
      : Promise.resolve([]),
    courseIds.length ? db.select().from(courseStaff).where(inArray(courseStaff.courseId, courseIds)) : Promise.resolve([]),
  ]);
  const clerkOnly = await clerkUsersByEmail(emails.filter((e) => !accounts.has(e)));

  const rows: Resolved[] = parsed.rows.map((checked) => {
    const base = { line: checked.line, cells: checked.raw, notes: [] as string[] };
    if (!checked.ok) return { ...base, outcome: "error", message: checked.error };
    const r = checked.row;
    const course = courseByCode.get(r.courseCode.toUpperCase());
    if (!course) return { ...base, row: r, outcome: "error", message: `No course “${r.courseCode}” in the current term.` };
    const out: Resolved = { ...base, row: r, courseId: course.id, courseCode: course.code, outcome: "skip", message: "" };

    const account = accounts.get(r.email);
    const clerkUser = account ? undefined : clerkOnly.get(r.email);
    const role: Role | null = account?.role ?? (clerkUser ? ((clerkUser.publicMetadata?.role as Role | undefined) ?? "student") : null);
    if (role && r.role === "student" && role !== "student") {
      return { ...out, outcome: "error", message: `${r.email} has ${roleLabel(role)} account; only students can be enrolled.` };
    }
    if (role && r.role === "instructor" && role === "student") {
      return { ...out, outcome: "error", message: `${r.email} has a student account. Change their role on the Users page first.` };
    }

    if (r.role === "student") {
      const section = sectionRows.find((s) => s.courseId === course.id && s.name.toLowerCase() === r.section.toLowerCase());
      out.sectionName = section?.name ?? r.section;
      if (!section) out.notes.push(`New section “${r.section}” in ${course.code}`);
      const already = account && enrolled.find((e) => e.userId === account.id && e.courseId === course.id);
      if (already) return { ...out, outcome: "skip", message: `Already enrolled (${already.section})`, notes: [] };
    } else {
      if (account && teaching.some((t) => t.userId === account.id && t.courseId === course.id)) {
        return { ...out, outcome: "skip", message: `Already teaches ${course.code}` };
      }
    }

    if (account) {
      out.userId = account.id;
    } else if (clerkUser) {
      out.linkFromClerk = true;
      out.notes.push("Has signed up but not opened Studyhall yet: linked now");
    } else {
      if (pendingKeys.has(`${r.email}|${course.id}`)) return { ...out, outcome: "skip", message: "Already invited" };
      return { ...out, outcome: "invite", message: `Invite by email, then ${r.role === "student" ? `enroll in ${out.sectionName}` : `add to ${course.code}'s staff`}` };
    }
    return r.role === "student"
      ? { ...out, outcome: "enroll", message: `Enroll in ${course.code} · ${out.sectionName}` }
      : { ...out, outcome: "teach", message: `Add to ${course.code}'s staff` };
  });
  return { ok: true, rows };
}

function summarize(rows: PlanRow[]): RosterPlan {
  const counts: Record<RowOutcome, number> = { error: 0, skip: 0, enroll: 0, teach: 0, invite: 0 };
  for (const r of rows) counts[r.outcome]++;
  return { rows: rows.map(({ line, cells, outcome, message, notes }) => ({ line, cells, outcome, message, notes })), counts };
}

export async function planRoster(text: string): Promise<{ ok: true; plan: RosterPlan } | { ok: false; error: string }> {
  const resolved = await resolve(text);
  if (!resolved.ok) return resolved;
  return { ok: true, plan: summarize(resolved.rows) };
}

/* Apply the good rows. Sections first (so new ones have ids), then Clerk
   links and invitations, then one batch with the enrollments, staff rows,
   invitations and audit rows. Rows Clerk refuses become errors. */
export async function applyRoster(
  text: string,
  actor: { id: string },
  redirectUrl: string,
): Promise<{ ok: true; plan: RosterPlan } | { ok: false; error: string }> {
  const resolved = await resolve(text);
  if (!resolved.ok) return resolved;
  const rows = resolved.rows;
  const acting = rows.filter((r) => r.outcome === "enroll" || r.outcome === "teach" || r.outcome === "invite");
  if (acting.length === 0) return { ok: true, plan: summarize(rows) };

  // 1. Sections the file names that its courses don't have yet.
  const wantedSections = new Map<string, { courseId: string; name: string }>();
  for (const r of acting) {
    if (r.row?.role === "student" && r.courseId && r.sectionName) wantedSections.set(`${r.courseId}|${r.sectionName.toLowerCase()}`, { courseId: r.courseId, name: r.sectionName });
  }
  if (wantedSections.size) await db.insert(sections).values([...wantedSections.values()]).onConflictDoNothing();
  const courseIds = [...new Set(acting.map((r) => r.courseId!))];
  const sectionRows = await db.select().from(sections).where(inArray(sections.courseId, courseIds));
  const sectionId = (r: Resolved) =>
    sectionRows.find((s) => s.courseId === r.courseId && s.name.toLowerCase() === r.sectionName?.toLowerCase())?.id ?? null;

  // 2. People who signed up with Clerk but never opened the app get their Neon row.
  const toLink = [...new Set(acting.filter((r) => r.linkFromClerk).map((r) => r.row!.email))];
  if (toLink.length) {
    const found = await clerkUsersByEmail(toLink);
    for (const r of acting.filter((x) => x.linkFromClerk)) {
      const u = found.get(r.row!.email);
      if (!u) {
        Object.assign(r, { outcome: "error", message: "Couldn't find their Clerk account. Try again." });
        continue;
      }
      r.userId = (await syncUserFromClerk(u)).id;
    }
  }

  // 3. Invitations, one per person (the role goes with it).
  const inviteRows = acting.filter((r) => r.outcome === "invite");
  const people = [...new Map(inviteRows.map((r) => [r.row!.email, { email: r.row!.email, role: r.row!.role as Role }])).values()];
  const sent = people.length ? await sendInvitations(people, redirectUrl) : new Map();
  for (const r of inviteRows) {
    const res = sent.get(r.row!.email);
    if (!res?.ok) Object.assign(r, { outcome: "error", message: res?.error ?? "Clerk didn't send this invitation.", notes: [] });
  }

  // 4. One batch for everything that's left.
  const enrollRows = acting.filter((r) => r.outcome === "enroll" && r.userId && sectionId(r));
  const teachRows = acting.filter((r) => r.outcome === "teach" && r.userId);
  const invited = inviteRows.filter((r) => r.outcome === "invite");
  const counts = { rows: rows.length, enrolled: enrollRows.length, teaching: teachRows.length, invited: invited.length };
  const audit = [
    ...enrollRows.map((r) => ({ actorId: actor.id, action: "enrollment.add", entityType: "course", entityId: r.courseId!, data: { userId: r.userId, sectionId: sectionId(r), via: "roster" } })),
    ...teachRows.map((r) => ({ actorId: actor.id, action: "course_staff.add", entityType: "course", entityId: r.courseId!, data: { userId: r.userId, via: "roster" } })),
    ...invited.map((r) => ({ actorId: actor.id, action: "invitation.send", entityType: "course", entityId: r.courseId!, data: { email: r.row!.email, role: r.row!.role, via: "roster" } })),
  ];
  await db.batch([
    db.insert(auditLog).values({ actorId: actor.id, action: "roster.import", entityType: "roster", entityId: null, data: { ...counts, errors: rows.filter((r) => r.outcome === "error").length } }),
    ...(enrollRows.length
      ? [
          db
            .insert(enrollments)
            .values(enrollRows.map((r) => ({ sectionId: sectionId(r)!, userId: r.userId!, status: "active" as const })))
            .onConflictDoUpdate({ target: [enrollments.sectionId, enrollments.userId], set: { status: "active", enrolledAt: sql`now()` } }),
        ]
      : []),
    ...(teachRows.length
      ? [db.insert(courseStaff).values(teachRows.map((r) => ({ courseId: r.courseId!, userId: r.userId!, role: "instructor" as const }))).onConflictDoNothing()]
      : []),
    ...(invited.length
      ? [
          saveInvitationsStatement(
            invited.map((r) => ({
              email: r.row!.email,
              name: r.row!.name,
              role: r.row!.role,
              courseId: r.courseId!,
              sectionId: r.row!.role === "student" ? sectionId(r) : null,
              clerkInvitationId: (sent.get(r.row!.email) as { ok: true; invitationId: string }).invitationId,
              invitedBy: actor.id,
            })),
          ),
        ]
      : []),
    ...(audit.length ? [db.insert(auditLog).values(audit)] : []),
  ]);

  for (const r of enrollRows) r.message = r.message.replace(/^Enroll/, "Enrolled");
  for (const r of teachRows) r.message = r.message.replace(/^Add/, "Added");
  for (const r of invited) r.message = r.message.replace(/^Invite by email/, "Invited by email");
  return { ok: true, plan: summarize(rows) };
}
