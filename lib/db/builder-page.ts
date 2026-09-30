import "server-only";

import { db } from "./client";
import { courseSetupFactsQuery, lessonBuilderFactsQuery, toLessonFacts } from "./course-builder";
import { courseForUserQueries, isStaffOf, isUuid, toCourseForUser, type Viewer } from "./courses";
import { courseEventsForStaffQuery, toEvents } from "./events";

/* The course builder's reads (feature 29): the staff check and everything
   the page shows in one batch, one round trip after the user lookup. Each
   statement checks course staff itself (invariant 4), so nothing comes
   back for anyone else, and the page 404s. */
export async function loadCourseBuilder(courseId: string, viewer: Viewer, eventsFrom: Date) {
  if (!isUuid(courseId)) return null;
  const staff = isStaffOf(courseId, viewer);
  const [access, mods, lessonRows, events, facts, [setup]] = await db.batch([
    ...courseForUserQueries(courseId, viewer),
    courseEventsForStaffQuery(viewer, courseId, eventsFrom),
    lessonBuilderFactsQuery(courseId, staff),
    courseSetupFactsQuery({ courseId }, staff),
  ]);
  const data = toCourseForUser([access, mods, lessonRows]);
  if (data?.access !== "staff") return null;
  return { data, upcoming: toEvents(events), facts: toLessonFacts(facts), setup: setup ?? null };
}
