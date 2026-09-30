import "server-only";

import { and, asc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { buildGradebook, categoryWeights, type GradebookItem, type GradebookRow } from "@/lib/coursework/gradebook";
import { toLearnerRow, type CourseLearners, type LearnerRow } from "@/lib/progress/learners";
import { nextUp, type NextUp } from "@/lib/progress/next-up";
import {
  completedCount,
  courseMastery,
  gradesSoFar,
  lessonProgress,
  untriedTopics,
  type CourseTopicMastery,
  type GradesSoFar,
  type ModuleProgress,
} from "@/lib/progress/report";
import { db, type BatchRows } from "./client";
import { isUuid, staffPredicate, type Viewer } from "./courses";
import { gradebookQueries, studentGradeQueries, toGradebookData, toStudentGradeRows, weightRowsQuery } from "./grades";
import { enrolledCourses, nextLessonsQuery, toNextLessons } from "./progress";
import { courses, enrollments, lessons, modules, quizAnswers, quizAttempts, quizQuestions, sections, users, watchProgress } from "./schema";

/* Learners and progress (feature 31). Everything comes from existing
   tables: enrollments, watch_progress, quiz_attempts, submissions and
   grades, card_reviews and lessons. Nothing reads assistant chats or a
   student's private space.

   Access is in the SQL of every statement:
   - staff see the students of the courses they teach (staffPredicate),
     admins every course's;
   - a student reads only their own rows, in the courses they're actively
     enrolled in (enrolledCourses).
   Each page is one db.batch after the user lookup (feature 29).

   Counts are over a course's published lessons (module and lesson
   published): the dashboard's rule (lib/db/dashboard.ts), so a course's
   average completion here is the dashboard's. Raw subqueries name the
   outer rows literally (`courses.id`, `users.id`): see courses.ts. */

const PUBLISHED = sql.raw(`m.course_id = courses.id and m.status = 'published' and l.status = 'published'`);
const IN_COURSE = sql.raw(`m.course_id = courses.id`);
const asDate = (v: string | Date) => new Date(v);

const publishedLessons = sql<number>`(select count(*) from lessons l join modules m on m.id = l.module_id
  where ${PUBLISHED})`.mapWith(Number);
const publishedAssignments = sql<number>`(select count(*) from assignments a join lessons l on l.id = a.lesson_id
  join modules m on m.id = l.module_id where ${PUBLISHED})`.mapWith(Number);

/* The learners of the courses in `courseIds` (a subquery that already
   holds the access check), one row per (course, student). */
function learnerFields(now: Date) {
  const at = sql`${now.toISOString()}::timestamptz`;
  return {
    courseId: courses.id,
    userId: users.id,
    name: users.name,
    email: users.email,
    sections: sql<string>`string_agg(distinct ${sections.name}, ', ' order by ${sections.name})`,
    lastActivityAt: sql<Date | null>`greatest(
      (select max(wp.updated_at) from watch_progress wp join lessons l on l.id = wp.lesson_id join modules m on m.id = l.module_id
        where wp.user_id = users.id and ${IN_COURSE}),
      (select max(cr.last_review) from card_reviews cr join flashcards f on f.id = cr.card_id join lessons l on l.id = f.lesson_id
        join modules m on m.id = l.module_id where cr.user_id = users.id and ${IN_COURSE}),
      (select max(coalesce(qa.submitted_at, qa.started_at)) from quiz_attempts qa join lessons l on l.id = qa.lesson_id
        join modules m on m.id = l.module_id where qa.user_id = users.id and ${IN_COURSE}),
      (select max(sub.submitted_at) from submissions sub join assignments a on a.id = sub.assignment_id
        join lessons l on l.id = a.lesson_id join modules m on m.id = l.module_id where sub.user_id = users.id and ${IN_COURSE}))`.mapWith(asDate),
    completed: sql<number>`(select count(*) from watch_progress wp join lessons l on l.id = wp.lesson_id join modules m on m.id = l.module_id
      where wp.user_id = users.id and wp.completed_at is not null and ${PUBLISHED})`.mapWith(Number),
    quizAttempts: sql<number>`(select count(*) from quiz_attempts qa join lessons l on l.id = qa.lesson_id join modules m on m.id = l.module_id
      where qa.user_id = users.id and qa.submitted_at is not null and ${PUBLISHED})`.mapWith(Number),
    quizAverage: sql<number | null>`(select avg(qa.score) from quiz_attempts qa join lessons l on l.id = qa.lesson_id
      join modules m on m.id = l.module_id where qa.user_id = users.id and qa.submitted_at is not null and ${PUBLISHED})`.mapWith(Number),
    handedIn: sql<number>`(select count(*) from submissions sub join assignments a on a.id = sub.assignment_id
      join lessons l on l.id = a.lesson_id join modules m on m.id = l.module_id where sub.user_id = users.id and ${PUBLISHED})`.mapWith(Number),
    graded: sql<number>`(select count(*) from submissions sub join assignments a on a.id = sub.assignment_id
      join lessons l on l.id = a.lesson_id join modules m on m.id = l.module_id
      where sub.user_id = users.id and sub.status = 'returned' and ${PUBLISHED})`.mapWith(Number),
    missing: sql<number>`(select count(*) from assignments a join lessons l on l.id = a.lesson_id join modules m on m.id = l.module_id
      where ${PUBLISHED} and a.due_at < ${at}
        and not exists (select 1 from submissions sub where sub.assignment_id = a.id and sub.user_id = users.id))`.mapWith(Number),
  };
}

function learnersQueries(courseIds: SQL, now: Date, student?: string) {
  return [
    db
      .select({
        course: { id: courses.id, code: courses.code, title: courses.title, status: courses.status },
        lessons: publishedLessons,
        assignments: publishedAssignments,
      })
      .from(courses)
      .where(sql`courses.id in ${courseIds}`)
      .orderBy(asc(courses.code)),
    db
      .select(learnerFields(now))
      .from(enrollments)
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .innerJoin(courses, eq(courses.id, sections.courseId))
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(and(eq(enrollments.status, "active"), sql`courses.id in ${courseIds}`, student ? eq(users.id, student) : undefined))
      .groupBy(courses.id, users.id)
      .orderBy(asc(users.name), asc(users.id)),
  ] as const;
}

function toCourseLearners([courseRows, learnerRows]: BatchRows<ReturnType<typeof learnersQueries>>): CourseLearners[] {
  return courseRows.map((c) => ({
    ...c,
    learners: learnerRows.filter((l) => l.courseId === c.course.id).map(({ courseId: _c, ...l }) => toLearnerRow(l, c.lessons)),
  }));
}

/* The courses this viewer teaches (admins: all), as a subquery. */
const taughtCourses = (viewer: Viewer) => sql`(select courses.id from courses where ${staffPredicate(viewer)})`;

/* One course, if this viewer teaches it. */
const taughtCourse = (courseId: string, viewer: Viewer) =>
  sql`(select courses.id from courses where courses.id = ${courseId} and ${staffPredicate(viewer)})`;

/* /instructor/learners: a table per course the viewer teaches. */
export async function loadLearners(viewer: Viewer, now: Date): Promise<CourseLearners[]> {
  return toCourseLearners(await db.batch(learnersQueries(taughtCourses(viewer), now)));
}

/* One course's table (the builder's Students tab, the CSV), or null when
   the viewer doesn't teach it. */
export async function courseLearners(courseId: string, viewer: Viewer, now: Date): Promise<CourseLearners | null> {
  if (!isUuid(courseId)) return null;
  return toCourseLearners(await db.batch(learnersQueries(taughtCourse(courseId, viewer), now)))[0] ?? null;
}

/* ---- One student's progress in a course ----------------------------------------- */

/* Published lessons of the courses in `courseIds`, in course order, with
   the student's watch progress. */
function lessonFactsQuery(userId: string, courseIds: SQL, guard?: SQL) {
  return db
    .select({
      courseId: modules.courseId,
      moduleId: modules.id,
      moduleTitle: modules.title,
      modulePos: modules.position,
      lessonId: lessons.id,
      title: lessons.title,
      kind: lessons.kind,
      lessonPos: lessons.position,
      durationSec: lessons.durationSec,
      completedAt: watchProgress.completedAt,
      watchedRanges: watchProgress.watchedRanges,
      updatedAt: watchProgress.updatedAt,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .leftJoin(watchProgress, and(eq(watchProgress.lessonId, lessons.id), eq(watchProgress.userId, userId)))
    .where(and(sql`${modules.courseId} in ${courseIds}`, eq(modules.status, "published"), eq(lessons.status, "published"), guard))
    .orderBy(asc(modules.position), asc(lessons.position));
}

/* Published questions on those lessons, the same set a lesson's mastery
   uses (lib/db/quizzes.ts). */
function masteryQuestionsQuery(courseIds: SQL) {
  return db
    .select({
      courseId: modules.courseId,
      id: quizQuestions.id,
      topic: quizQuestions.topic,
      lessonId: lessons.id,
      modulePos: modules.position,
      lessonPos: lessons.position,
      startSec: quizQuestions.startSec,
    })
    .from(quizQuestions)
    .innerJoin(lessons, eq(lessons.id, quizQuestions.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(sql`${modules.courseId} in ${courseIds}`, eq(modules.status, "published"), eq(lessons.status, "published"), eq(quizQuestions.status, "published")));
}

/* The student's answers from their submitted attempts on those lessons. */
function masteryAnswersQuery(userId: string, courseIds: SQL, guard?: SQL) {
  return db
    .select({ courseId: modules.courseId, questionId: quizAnswers.questionId, correct: quizAnswers.correct })
    .from(quizAnswers)
    .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.attemptId))
    .innerJoin(lessons, eq(lessons.id, quizAttempts.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        isNotNull(quizAttempts.submittedAt),
        sql`${modules.courseId} in ${courseIds}`,
        eq(modules.status, "published"),
        eq(lessons.status, "published"),
        guard,
      ),
    );
}

export interface StudentReport {
  course: CourseLearners["course"];
  lessons: number;
  learner: LearnerRow;
  modules: ModuleProgress[];
  mastery: CourseTopicMastery[];
  untried: number;
  items: GradebookItem[];
  grades: GradebookRow;
}

/* The teacher's report on one student in one course: per-lesson
   completion, quiz mastery per topic and grades (with drafts and work
   still to grade, as the gradebook shows them, for the published lessons
   the other numbers count). Null, so the page 404s,
   unless the viewer teaches the course and the student is actively
   enrolled in it. Every statement carries both checks. */
export async function loadStudentReport(courseId: string, studentId: string, viewer: Viewer, now: Date): Promise<StudentReport | null> {
  if (!isUuid(courseId) || !isUuid(studentId)) return null;
  const course = taughtCourse(courseId, viewer);
  const guard = sql`exists (select 1 from enrollments e join sections s on s.id = e.section_id
    where s.course_id = ${courseId} and e.user_id = ${studentId} and e.status = 'active')
    and exists (select 1 from courses where courses.id = ${courseId} and ${staffPredicate(viewer)})`;
  const [courseRows, learnerRows, lessonRows, questions, answers, ...gradebook] = await db.batch([
    ...learnersQueries(course, now, studentId),
    lessonFactsQuery(studentId, course, guard),
    masteryQuestionsQuery(course),
    masteryAnswersQuery(studentId, course, guard),
    ...gradebookQueries(courseId, { student: studentId, guard, publishedOnly: true }),
  ]);
  const [found] = toCourseLearners([courseRows, learnerRows]);
  const learner = found?.learners[0];
  if (!found || !learner) return null;

  const book = toGradebookData(gradebook);
  const [grades] = buildGradebook({ ...book, weights: categoryWeights(book.weightRows), now: now.getTime() });
  if (!grades) return null;
  const mastery = courseMastery(questions, answers);
  return {
    course: found.course,
    lessons: found.lessons,
    learner,
    modules: lessonProgress(lessonRows),
    mastery,
    untried: untriedTopics(questions, mastery),
    items: book.items,
    grades,
  };
}

/* ---- The student's own /progress ---------------------------------------------- */

export interface CourseProgressView {
  course: { id: string; code: string; title: string };
  lessons: number;
  completed: number;
  modules: ModuleProgress[];
  mastery: CourseTopicMastery[];
  untried: number;
  grades: GradesSoFar;
}

export interface ProgressPage {
  courses: CourseProgressView[];
  next: NextUp;
}

/* Every course the student is actively enrolled in (published), with
   their own lessons, mastery and grades, and one "Next up" across them.
   Only the viewer's own rows are read: there is no way to ask for anyone
   else's. */
export async function loadProgress(viewer: Viewer, now: Date): Promise<ProgressPage> {
  const mine = enrolledCourses(viewer.id);
  const [courseRows, lessonRows, nextRows, questions, answers, assignmentRows, quizRows, weightRows] = await db.batch([
    db
      .select({ course: { id: courses.id, code: courses.code, title: courses.title }, lessons: publishedLessons })
      .from(courses)
      .where(sql`courses.id in ${mine}`)
      .orderBy(asc(courses.title)),
    lessonFactsQuery(viewer.id, mine),
    nextLessonsQuery(viewer.id),
    masteryQuestionsQuery(mine),
    masteryAnswersQuery(viewer.id, mine),
    ...studentGradeQueries(viewer),
    weightRowsQuery(mine),
  ]);

  const gradeRows = toStudentGradeRows([assignmentRows, quizRows]);
  const nextLessons = toNextLessons(nextRows);
  const views = courseRows.map(({ course, lessons: lessonCount }) => {
    const facts = lessonRows.filter((l) => l.courseId === course.id);
    const courseQuestions = questions.filter((q) => q.courseId === course.id);
    const mastery = courseMastery(
      courseQuestions,
      answers.filter((a) => a.courseId === course.id),
    );
    const items = gradeRows.filter((g) => g.courseId === course.id);
    return {
      view: {
        course,
        lessons: lessonCount,
        completed: completedCount(facts),
        modules: lessonProgress(facts),
        mastery,
        untried: untriedTopics(courseQuestions, mastery),
        grades: gradesSoFar(
          items,
          weightRows.filter((w) => w.courseId === course.id),
          now.getTime(),
        ),
      },
      next: {
        courseId: course.id,
        code: course.code,
        nextLesson: nextLessons.get(course.id) ?? null,
        lastWatchedAt: facts.reduce<Date | null>((latest, f) => (f.updatedAt && (!latest || f.updatedAt > latest) ? f.updatedAt : latest), null),
        work: items.map((g) => ({ lessonId: g.lessonId, title: g.title, kind: g.kind, dueAt: g.dueAt, handedIn: g.status !== null })),
        topics: mastery,
      },
    };
  });
  return { courses: views.map((v) => v.view), next: nextUp(views.map((v) => v.next), now.getTime()) };
}
