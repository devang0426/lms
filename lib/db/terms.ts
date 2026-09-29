import "server-only";

import { desc, sql } from "drizzle-orm";
import { db } from "./client";
import { terms } from "./schema";

/* Academic terms (feature 22, admin screens: callers check the role). */
export async function listTerms() {
  return db
    .select({
      id: terms.id,
      name: terms.name,
      startsOn: terms.startsOn,
      endsOn: terms.endsOn,
      isCurrent: terms.isCurrent,
      courses: sql<number>`(select count(*) from courses c where c.term_id = terms.id)`.mapWith(Number),
    })
    .from(terms)
    .orderBy(desc(terms.startsOn));
}
