import "server-only";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "./client";
import { auditLog, users } from "./schema";

/* An audit_log insert, returned unexecuted so callers can put it in the
   same db.batch as the change it records. */
export function auditInsert(entry: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
}) {
  return db.insert(auditLog).values(entry);
}

/* ---- Reading the log (feature 22, admins only: callers check the role) ---- */

export interface AuditFilter {
  action?: string;
  entityType?: string;
  /* Name or email of who did it. */
  actor?: string;
  /* The id of the last row shown: the "Older" page starts after it. The
     comparison uses that row's own timestamp in SQL, because JavaScript
     dates drop Postgres's microseconds, and rows written in one batch
     share a timestamp (the id breaks the tie). */
  beforeId?: string;
  limit?: number;
}

export interface AuditEntry {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  data: unknown;
  actorName: string | null;
  actorEmail: string | null;
}

export async function listAudit(filter: AuditFilter): Promise<AuditEntry[]> {
  const actor = filter.actor?.trim();
  const pattern = actor ? `%${actor.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      data: auditLog.data,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(
      and(
        filter.action ? eq(auditLog.action, filter.action) : undefined,
        filter.entityType ? eq(auditLog.entityType, filter.entityType) : undefined,
        pattern ? or(ilike(users.name, pattern), ilike(users.email, pattern)) : undefined,
        filter.beforeId
          ? sql`(${auditLog.createdAt}, ${auditLog.id}) < (select a.created_at, a.id from audit_log a where a.id = ${filter.beforeId}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(filter.limit ?? 50);
}

/* The actions and entity types that occur, for the filter menus. */
export async function auditVocabulary(): Promise<{ actions: string[]; entityTypes: string[] }> {
  const [actions, entityTypes] = await db.batch([
    db.selectDistinct({ v: auditLog.action }).from(auditLog).orderBy(auditLog.action),
    db.selectDistinct({ v: auditLog.entityType }).from(auditLog).orderBy(auditLog.entityType),
  ]);
  return { actions: actions.map((a) => a.v), entityTypes: entityTypes.map((e) => e.v) };
}
