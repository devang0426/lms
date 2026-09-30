import "server-only";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { NotificationFeed } from "@/lib/notifications/view";
import { db } from "./client";
import { notifications, type NotificationKind } from "./schema";

/* In-app notifications (feature 21). Personal: every read and update is
   filtered on the recipient. They're written in the same batch as what
   they announce (a returned grade, a reply, an announcement), or by the
   daily due-soon task. */

export function notifyStatement(input: { userId: string; kind: NotificationKind; title: string; url: string }) {
  return db.insert(notifications).values(input);
}

/* The bell: the newest few, and how many are unread, in one round trip. */
export async function notificationFeed(userId: string, limit = 12): Promise<NotificationFeed> {
  const [items, [unread]] = await db.batch([
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        title: notifications.title,
        url: notifications.url,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  return {
    unread: unread?.n ?? 0,
    items: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, url: n.url, read: n.readAt !== null, createdAt: n.createdAt.getTime() })),
    now: Date.now(),
  };
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/* The daily due-soon run: every student with an assignment due in the 24
   hours after `now` that they can see and haven't handed in gets one
   notice. The key includes the due time, so a re-run (or a retry) sends
   nothing twice, but a moved due date is announced again. Course staff
   aren't students here. Returns how many were sent. */
export async function notifyDueSoon(now: Date): Promise<number> {
  const result = await db.execute<{ id: string }>(sql`
    insert into notifications (user_id, kind, title, url, dedupe_key)
    select distinct e.user_id, 'due_soon'::notification_kind,
      c.code || ' · “' || l.title || '” is due within a day',
      '/courses/' || c.id || '/lessons/' || l.id,
      'due:' || a.id || ':' || floor(extract(epoch from a.due_at))::bigint
    from assignments a
    join lessons l on l.id = a.lesson_id
    join modules m on m.id = l.module_id
    join courses c on c.id = m.course_id
    join sections s on s.course_id = c.id
    join enrollments e on e.section_id = s.id and e.status = 'active'
    where c.status = 'published' and m.status = 'published' and l.status = 'published'
      and a.due_at > ${now.toISOString()}::timestamptz
      and a.due_at <= ${now.toISOString()}::timestamptz + interval '24 hours'
      and not exists (select 1 from submissions sub where sub.assignment_id = a.id and sub.user_id = e.user_id)
      and not exists (select 1 from course_staff cs where cs.course_id = c.id and cs.user_id = e.user_id)
    on conflict (user_id, dedupe_key) do nothing
    returning id`);
  return result.rows.length;
}

/* "Drafts ready" (feature 30; architecture.md, video pipeline step 12):
   once video-process has drafted a lecture's chapters, notes, cards and
   quiz, the instructor who uploaded it gets a notice that opens the review
   screen. Only while they still teach the course (or are an admin), so the
   link works for them. Keyed on the video: a re-run sends nothing twice,
   and a replacement upload is announced again. The seeded lecture has no
   uploader, so it sends nothing. Returns whether a notice was sent. */
export async function notifyDraftsReady(videoId: string): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    insert into notifications (user_id, kind, title, url, dedupe_key)
    select u.id, 'draft_ready'::notification_kind,
      c.code || ' · Drafts for “' || l.title || '” are ready to review',
      '/instructor/courses/' || c.id || '/lessons/' || l.id || '/review',
      'drafts:' || v.id
    from videos v
    join lessons l on l.id = v.lesson_id
    join modules m on m.id = l.module_id
    join courses c on c.id = m.course_id
    join users u on u.id = v.created_by and u.deleted_at is null
    where v.id = ${videoId}::uuid
      and (u.role = 'admin' or exists (select 1 from course_staff cs where cs.course_id = c.id and cs.user_id = u.id))
    on conflict (user_id, dedupe_key) do nothing
    returning id`);
  return result.rows.length > 0;
}
