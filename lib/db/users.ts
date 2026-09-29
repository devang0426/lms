import "server-only";

import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
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
}

export async function listUsers(filter: { q?: string; role?: Role; limit?: number }): Promise<UserRow[]> {
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
    })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        filter.role ? eq(users.role, filter.role) : undefined,
        pattern ? or(ilike(users.name, pattern), ilike(users.email, pattern)) : undefined,
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
