import "server-only";

import { and, asc, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { discussionHref } from "@/lib/discussions/view";
import { replyNoticeTitle } from "@/lib/notifications/view";
import { db } from "./client";
import { enrolledPredicate, staffPredicate, type Viewer } from "./courses";
import { courses, discussionReplies, discussions, lessons, modules, notifications, users, type DiscussionStatus, type Role } from "./schema";

/* Course discussions (feature 21): question threads the whole class reads.
   A thread is visible to its course's staff (admins included), and to
   students actively enrolled in the published course; one about a lesson
   only while that lesson and its module are published. That rule is in
   the SQL of every read below, and of the reply and answer checks. Only
   staff mark a reply as the answer. */

function visibleTo(viewer: Viewer): SQL {
  return or(
    staffPredicate(viewer),
    and(
      eq(courses.status, "published"),
      enrolledPredicate(viewer),
      or(isNull(discussions.lessonId), and(eq(lessons.status, "published"), eq(modules.status, "published"))),
    ),
  )!;
}

/* Is this user (a thread's or reply's author) staff on the thread's course? */
const authorIsStaff = (authorCol: SQL) =>
  sql<boolean>`(${users.role} = 'admin' or exists (select 1 from course_staff cs
    where cs.course_id = ${discussions.courseId} and cs.user_id = ${authorCol}))`;

export interface DiscussionSummary {
  id: string;
  title: string;
  status: DiscussionStatus;
  createdAt: Date;
  courseId: string;
  courseCode: string;
  lessonId: string | null;
  lessonTitle: string | null;
  authorName: string;
  authorIsStaff: boolean;
  mine: boolean;
  replies: number;
  lastActivityAt: Date;
}

function summaryColumns(viewer: Viewer) {
  return {
    id: discussions.id,
    title: discussions.title,
    status: discussions.status,
    createdAt: discussions.createdAt,
    courseId: discussions.courseId,
    courseCode: courses.code,
    lessonId: discussions.lessonId,
    lessonTitle: lessons.title,
    authorName: users.name,
    authorIsStaff: authorIsStaff(sql`${discussions.authorId}`),
    mine: sql<boolean>`${discussions.authorId} = ${viewer.id}`,
    replies: sql<number>`(select count(*) from discussion_replies r where r.discussion_id = ${discussions.id})`.mapWith(Number),
    lastActivityAt: sql<Date>`coalesce((select max(r.created_at) from discussion_replies r where r.discussion_id = ${discussions.id}), ${discussions.createdAt})`.mapWith(
      (v: string | Date) => new Date(v),
    ),
  };
}

function summaryQuery(viewer: Viewer) {
  return db
    .select(summaryColumns(viewer))
    .from(discussions)
    .innerJoin(courses, eq(courses.id, discussions.courseId))
    .innerJoin(users, eq(users.id, discussions.authorId))
    .leftJoin(lessons, eq(lessons.id, discussions.lessonId))
    .leftJoin(modules, eq(modules.id, lessons.moduleId));
}

export interface DiscussionFilter {
  courseId?: string;
  lessonId?: string;
  status?: DiscussionStatus;
  mineOnly?: boolean;
  limit?: number;
}

/* Threads the viewer can read, most recently active first. */
export function listDiscussionsQuery(viewer: Viewer, filter: DiscussionFilter = {}) {
  return summaryQuery(viewer)
    .where(
      and(
        visibleTo(viewer),
        filter.courseId ? eq(discussions.courseId, filter.courseId) : undefined,
        filter.lessonId ? eq(discussions.lessonId, filter.lessonId) : undefined,
        filter.status ? eq(discussions.status, filter.status) : undefined,
        filter.mineOnly ? eq(discussions.authorId, viewer.id) : undefined,
      ),
    )
    .orderBy(sql`coalesce((select max(r.created_at) from discussion_replies r where r.discussion_id = ${discussions.id}), ${discussions.createdAt}) desc`, desc(discussions.id))
    .limit(filter.limit ?? 100);
}

export async function listDiscussions(viewer: Viewer, filter: DiscussionFilter = {}): Promise<DiscussionSummary[]> {
  return toDiscussionSummaries(await listDiscussionsQuery(viewer, filter));
}

/* How many of a lesson's threads the viewer can read, capped like the
   player's list: the Discussion tab's count, in the player's batch while
   the list itself streams in (feature 29). */
export function lessonDiscussionCountQuery(viewer: Viewer, lessonId: string, cap: number) {
  return db
    .select({ n: sql<number>`least(count(*), ${cap})`.mapWith(Number) })
    .from(discussions)
    .innerJoin(courses, eq(courses.id, discussions.courseId))
    .leftJoin(lessons, eq(lessons.id, discussions.lessonId))
    .leftJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(visibleTo(viewer), eq(discussions.lessonId, lessonId)));
}

/* "Unanswered questions": open threads in the courses this viewer
   teaches, the longest waiting first. */
export function unansweredQuestionsQuery(viewer: Viewer, limit = 50) {
  return summaryQuery(viewer)
    .where(and(staffPredicate(viewer), eq(discussions.status, "open")))
    .orderBy(asc(discussions.createdAt), asc(discussions.id))
    .limit(limit);
}

export function toDiscussionSummaries(rows: Awaited<ReturnType<typeof unansweredQuestionsQuery>>): DiscussionSummary[] {
  return rows.map((r) => ({ ...r, authorIsStaff: Boolean(r.authorIsStaff), mine: Boolean(r.mine) }));
}

export async function unansweredQuestions(viewer: Viewer, limit = 50): Promise<DiscussionSummary[]> {
  return toDiscussionSummaries(await unansweredQuestionsQuery(viewer, limit));
}

export interface ReplyView {
  id: string;
  body: string;
  isAnswer: boolean;
  createdAt: Date;
  authorName: string;
  authorIsStaff: boolean;
  mine: boolean;
}

export interface DiscussionThread {
  discussion: DiscussionSummary & { body: string };
  replies: ReplyView[];
  /* The viewer teaches this course: may mark the answer. */
  canModerate: boolean;
}

/* One thread with its replies, if the viewer can read it (one round trip,
   the access rule in both queries). */
export async function getDiscussionThread(viewer: Viewer, discussionId: string): Promise<DiscussionThread | null> {
  const [found, replyRows] = await db.batch([
    db
      .select({ ...summaryColumns(viewer), body: discussions.body, canModerate: sql<boolean>`${staffPredicate(viewer)}` })
      .from(discussions)
      .innerJoin(courses, eq(courses.id, discussions.courseId))
      .innerJoin(users, eq(users.id, discussions.authorId))
      .leftJoin(lessons, eq(lessons.id, discussions.lessonId))
      .leftJoin(modules, eq(modules.id, lessons.moduleId))
      .where(and(eq(discussions.id, discussionId), visibleTo(viewer)))
      .limit(1),
    db
      .select({
        id: discussionReplies.id,
        body: discussionReplies.body,
        isAnswer: discussionReplies.isAnswer,
        createdAt: discussionReplies.createdAt,
        authorName: users.name,
        authorIsStaff: authorIsStaff(sql`${discussionReplies.authorId}`),
        mine: sql<boolean>`${discussionReplies.authorId} = ${viewer.id}`,
      })
      .from(discussionReplies)
      .innerJoin(discussions, eq(discussions.id, discussionReplies.discussionId))
      .innerJoin(courses, eq(courses.id, discussions.courseId))
      .innerJoin(users, eq(users.id, discussionReplies.authorId))
      .leftJoin(lessons, eq(lessons.id, discussions.lessonId))
      .leftJoin(modules, eq(modules.id, lessons.moduleId))
      .where(and(eq(discussionReplies.discussionId, discussionId), visibleTo(viewer)))
      .orderBy(asc(discussionReplies.createdAt), asc(discussionReplies.id)),
  ]);
  const row = found[0];
  if (!row) return null;
  const { canModerate, ...discussion } = row;
  return {
    discussion: { ...discussion, authorIsStaff: Boolean(discussion.authorIsStaff), mine: Boolean(discussion.mine) },
    replies: replyRows.map((r) => ({ ...r, authorIsStaff: Boolean(r.authorIsStaff), mine: Boolean(r.mine) })),
    canModerate: Boolean(canModerate),
  };
}

/* What a reply or an answer mark needs to know, if the viewer can read
   the thread: its course, its author (to notify) and whether the viewer
   teaches the course. */
export interface ThreadAccess {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  authorId: string;
  authorRole: Role;
  viewerIsStaff: boolean;
}

export async function threadAccess(viewer: Viewer, discussionId: string): Promise<ThreadAccess | null> {
  const [row] = await db
    .select({
      id: discussions.id,
      courseId: discussions.courseId,
      lessonId: discussions.lessonId,
      title: discussions.title,
      authorId: discussions.authorId,
      authorRole: users.role,
      viewerIsStaff: sql<boolean>`${staffPredicate(viewer)}`,
    })
    .from(discussions)
    .innerJoin(courses, eq(courses.id, discussions.courseId))
    .innerJoin(users, eq(users.id, discussions.authorId))
    .leftJoin(lessons, eq(lessons.id, discussions.lessonId))
    .leftJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(eq(discussions.id, discussionId), visibleTo(viewer)))
    .limit(1);
  return row ? { ...row, viewerIsStaff: Boolean(row.viewerIsStaff) } : null;
}

/* ---- Writes (the actions check access first, then batch these with the
   audit row) ------------------------------------------------------------------ */

/* The posting limit's count (feature 25): the person's new threads or
   replies in the window, from their audit rows, so a deleted post still
   counts. Used inside a locked batch (lib/db/limits). */
export function recentPosts(authorId: string, kind: "threads" | "replies", windowMinutes: number): SQL {
  const action = kind === "threads" ? "discussion.start" : "discussion.reply";
  return sql`select count(*) from audit_log where audit_log.actor_id = ${authorId}::uuid
    and audit_log.action = ${action} and audit_log.created_at > now() - make_interval(mins => ${windowMinutes})`;
}

export function startDiscussionStatement(input: {
  id: string;
  courseId: string;
  lessonId: string | null;
  authorId: string;
  title: string;
  body: string;
}) {
  return db.insert(discussions).values(input);
}

/* Clear the thread's answer, set a new one (a reply of this thread only),
   then derive the status from what's marked. Three statements, in order:
   the one-answer index is checked row by row. */
export function markAnswerStatements(discussionId: string, replyId: string | null) {
  return [
    db
      .update(discussionReplies)
      .set({ isAnswer: false })
      .where(and(eq(discussionReplies.discussionId, discussionId), eq(discussionReplies.isAnswer, true))),
    ...(replyId
      ? [
          db
            .update(discussionReplies)
            .set({ isAnswer: true })
            .where(and(eq(discussionReplies.id, replyId), eq(discussionReplies.discussionId, discussionId))),
        ]
      : []),
    db.execute(sql`
      update discussions set status = case when exists (
        select 1 from discussion_replies r where r.discussion_id = ${discussionId} and r.is_answer) then 'answered'::discussion_status else 'open'::discussion_status end
      where id = ${discussionId}`),
  ];
}

/* A reply, the thread author's notification (unless they wrote it), and,
   when staff reply "as the answer", the answer mark. */
export function replyStatements(input: {
  id: string;
  thread: ThreadAccess;
  author: { id: string; name: string };
  body: string;
  markAnswer: boolean;
}) {
  const { thread } = input;
  return [
    db.insert(discussionReplies).values({ id: input.id, discussionId: thread.id, authorId: input.author.id, body: input.body }),
    ...(input.markAnswer && thread.viewerIsStaff ? markAnswerStatements(thread.id, input.id) : []),
    ...(thread.authorId !== input.author.id
      ? [
          db.insert(notifications).values({
            userId: thread.authorId,
            kind: "discussion_reply",
            title: replyNoticeTitle(input.author.name, thread.title),
            url: discussionHref(thread.id, thread.authorRole),
          }),
        ]
      : []),
  ];
}
