/* When a course may be deleted (feature 35). Pure: the builder's Delete
   dialog uses these to explain itself, and deleteCourse enforces them. The
   same rule is checked again inside the delete statement
   (lib/db/course-delete.ts), so a change made meanwhile still stops it.

   A course goes only when nobody depends on it: no active student, no
   handed-in work (submissions and graded attempts are kept for audit) and
   no invitation waiting to be accepted. Anything else is unpublished. */

export interface CourseDeleteFacts {
  activeStudents: number;
  /* Submissions to its assignments plus submitted graded quiz attempts. */
  handedIn: number;
  pendingInvitations: number;
  /* What would go with it, for the dialog. */
  modules: number;
  lessons: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function courseDeleteRefusal(facts: CourseDeleteFacts): string | null {
  if (facts.activeStudents > 0) {
    return `${plural(facts.activeStudents, "student is", "students are")} enrolled, so this course can't be deleted. Unpublish it instead.`;
  }
  if (facts.handedIn > 0) {
    return "Students have handed in work here (an assignment or a graded quiz), so this course can't be deleted. Unpublish it instead.";
  }
  if (facts.pendingInvitations > 0) {
    return `${plural(facts.pendingInvitations, "invitation to this course is", "invitations to this course are")} waiting to be accepted. Withdraw ${facts.pendingInvitations === 1 ? "it" : "them"} under Admin → Users first.`;
  }
  return null;
}

/* What goes with the course, for the confirm dialog. */
export function courseDeleteContents(facts: Pick<CourseDeleteFacts, "modules" | "lessons">): string[] {
  return [
    facts.modules + facts.lessons > 0
      ? `${plural(facts.modules, "module")} and ${plural(facts.lessons, "lesson")}, with their videos, documents, notes, flashcards, quizzes and podcasts`
      : "The course itself (it has no modules or lessons)",
    "Its announcements, discussions, calendar events and assistant chats",
    "Its sections and any dropped enrollments (the audit log keeps their history)",
  ];
}

/* The course code, typed to confirm. Spaces and case don't matter:
   "math201" confirms "MATH 201". */
export function confirmsCourse(typed: string, code: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return norm(code) !== "" && norm(typed) === norm(code);
}
