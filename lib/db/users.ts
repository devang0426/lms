import "server-only";

import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "./client";
import { isUuid } from "./courses";
import { users, type Role, type User } from "./schema";

/* People (feature 22, admin only: callers check requireRole("admin")
   first). Clerk owns identity and the role; these read and update the
   Neon mirror. */

export interface UserRow {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  role: Role;
  createdAt: Date;
  /* Active enrollments, and courses taught. */
  courses: number;
  teaching: number;
  /* AI calls and cost over the last 24 hours (feature 25). */
  aiCalls: number;
  aiUsd: number;
}

/* The daily AI limits by group, from lib/ai/budget (the page passes them in). */
export interface AiLimitsByGroup {
  student: { calls: number; usd: number };
  staff: { calls: number; usd: number };
}

const aiWindow = sql`a.user_id = users.id and a.created_at > now() - interval '24 hours'`;

/* The person has reached their role's daily AI limit (calls or cost). */
function atAiLimit(limits: AiLimitsByGroup): SQL {
  return sql`exists (
    select 1 from (select count(*) as n, coalesce(sum(a.cost_usd), 0) as usd from ai_usage a where ${aiWindow}) u
    where u.n >= case when users.role = 'student' then ${limits.student.calls}::int else ${limits.staff.calls}::int end
       or u.usd >= case when users.role = 'student' then ${limits.student.usd}::numeric else ${limits.staff.usd}::numeric end)`;
}

export async function listUsers(filter: { q?: string; role?: Role; atAiLimit?: AiLimitsByGroup; limit?: number }): Promise<UserRow[]> {
  const q = filter.q?.trim();
  const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      imageUrl: users.imageUrl,
      role: users.role,
      createdAt: users.createdAt,
      courses: sql<number>`(select count(distinct s.course_id) from enrollments e join sections s on s.id = e.section_id
        where e.user_id = users.id and e.status = 'active')`.mapWith(Number),
      teaching: sql<number>`(select count(*) from course_staff cs where cs.user_id = users.id)`.mapWith(Number),
      aiCalls: sql<number>`(select count(*) from ai_usage a where ${aiWindow})`.mapWith(Number),
      aiUsd: sql<number>`(select coalesce(sum(a.cost_usd), 0) from ai_usage a where ${aiWindow})`.mapWith(Number),
    })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        filter.role ? eq(users.role, filter.role) : undefined,
        pattern ? or(ilike(users.name, pattern), ilike(users.email, pattern)) : undefined,
        filter.atAiLimit ? atAiLimit(filter.atAiLimit) : undefined,
      ),
    )
    .orderBy(asc(users.name), asc(users.id))
    .limit(filter.limit ?? 200);
}

export async function roleCounts(): Promise<Record<Role, number>> {
  const rows = await db
    .select({ role: users.role, n: sql<number>`count(*)`.mapWith(Number) })
    .from(users)
    .where(isNull(users.deletedAt))
    .groupBy(users.role);
  return { admin: 0, instructor: 0, student: 0, ...Object.fromEntries(rows.map((r) => [r.role, r.n])) };
}

/* How many people are at their daily AI limit now, for the filter chip. */
export async function countAtAiLimit(limits: AiLimitsByGroup): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(users)
    .where(and(isNull(users.deletedAt), atAiLimit(limits)));
  return row?.n ?? 0;
}

export async function getUser(id: string): Promise<User | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
  return row ?? null;
}

/* Accounts with these emails (lowercase), for the roster import. */
export async function usersByEmail(emails: string[]): Promise<Map<string, User>> {
  if (emails.length === 0) return new Map();
  const rows = await db
    .select()
    .from(users)
    .where(and(isNull(users.deletedAt), inArray(sql`lower(${users.email})`, emails)));
  return new Map(rows.map((u) => [u.email.toLowerCase(), u]));
}

export function setRoleStatement(userId: string, role: Role) {
  return db.update(users).set({ role }).where(eq(users.id, userId));
}
