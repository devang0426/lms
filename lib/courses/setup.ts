/* "Get your course live" (feature 27, N8): the six steps from an empty
   course to students watching a lecture, each worked out from the data
   (lib/db/course-builder.ts → courseSetupFacts). Pure. */

export interface CourseSetupFacts {
  courseId: string;
  /* The summary students read in Explore is filled in. */
  hasDetails: boolean;
  modules: number;
  /* Video lessons with a ready (processed) video. */
  lectures: number;
  /* The lecture to review: one with drafts left if any, else the first. */
  reviewLessonId: string | null;
  /* A lecture has AI content and none of it is left as a draft. */
  reviewed: boolean;
  /* A lecture is published, in a published module, in a published course. */
  live: boolean;
  /* Active enrollments. */
  students: number;
}

export type SetupStepKey = "details" | "module" | "lecture" | "review" | "publish" | "students";

export interface SetupStep {
  key: SetupStepKey;
  title: string;
  hint: string;
  done: boolean;
  /* The first step not done yet; the rest are upcoming. */
  current: boolean;
  /* Where to do it, when there is a page for it. */
  href: string | null;
  action: string | null;
}

export function setupSteps(facts: CourseSetupFacts, viewer: { canEnroll: boolean }): SetupStep[] {
  const course = `/instructor/courses/${facts.courseId}`;
  const steps: Omit<SetupStep, "current">[] = [
    {
      key: "details",
      title: "Fill in the course details",
      hint: "A summary and what students will learn. Students read them in Explore.",
      done: facts.hasDetails,
      href: `${course}?tab=details`,
      action: "Add details",
    },
    {
      key: "module",
      title: "Add a module",
      hint: "Modules group lessons, e.g. “Week 1 · Vectors”.",
      done: facts.modules > 0,
      href: course,
      action: "Add a module",
    },
    {
      key: "lecture",
      title: "Upload a lecture",
      hint: "Use Upload lecture on a module. The video is checked, transcribed and captioned.",
      done: facts.lectures > 0,
      href: course,
      action: "Upload a lecture",
    },
    {
      key: "review",
      title: "Review the AI drafts",
      hint: "Check the chapters, notes, flashcards and quiz drafted from the lecture.",
      done: facts.reviewed,
      href: facts.reviewLessonId ? `${course}/lessons/${facts.reviewLessonId}/review` : null,
      action: facts.reviewLessonId ? "Review drafts" : null,
    },
    {
      key: "publish",
      title: "Publish the lesson, module and course",
      hint: "Students see a lesson once it, its module and the course are all published.",
      done: facts.live,
      href: course,
      action: "Publish",
    },
    {
      key: "students",
      title: "Enroll students",
      hint: facts.students > 0
        ? `${facts.students} ${facts.students === 1 ? "student is" : "students are"} enrolled.`
        : viewer.canEnroll
          ? "Enroll them one by one or import a roster."
          : "An admin enrolls students or imports a roster.",
      done: facts.students > 0,
      href: viewer.canEnroll ? `/admin/courses/${facts.courseId}/enrollments` : null,
      action: viewer.canEnroll ? "Enroll students" : null,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ ...s, current: i === current }));
}

export function setupComplete(steps: SetupStep[]): boolean {
  return steps.every((s) => s.done);
}
