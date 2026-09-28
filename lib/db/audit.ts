import "server-only";

import { db } from "./client";
import { auditLog } from "./schema";

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
