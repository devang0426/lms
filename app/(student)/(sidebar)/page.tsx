import Link from "next/link";
import { redirect } from "next/navigation";
import { filterCourses, parseCourseFilter, pickCurrentCourse } from "@/components/student/course-view";
import { HomeGreeting } from "@/components/student/home-greeting";
import {
  ComingUpCard,
  CompactCourseList,
  ContinueCard,
  CourseFilterChips,
  CourseGrid,
  DueNotice,
} from "@/components/student/home-cards";
import { loadStudentCourses } from "@/components/student/load-courses";
import { EmptyState, SearchField } from "@/components/ui";
import { homePathFor, requireAreaRole } from "@/lib/auth";
import { upcomingEvents } from "@/lib/db/events";
import { requestTime } from "@/lib/utils/clock";
import { firstName } from "@/lib/utils/format";

/* Student home (wireframe 02; below 768px, the Mobile home wireframe 07).
   Staff land on the teaching dashboard instead: the demo admin signs in to
   "/" and ends up on /instructor. */
export default async function StudentHomePage({ searchParams }: PageProps<"/">) {
  const user = await requireAreaRole("student", "admin");
  if (user.role !== "student") redirect(homePathFor(user.role));

  const { show } = await searchParams;
  const filter = parseCourseFilter(show);
  const now = requestTime();
  const [courses, comingUp] = await Promise.all([loadStudentCourses(user), upcomingEvents(user, new Date(now), 3)]);
  const current = pickCurrentCourse(courses);
  const name = firstName(user.name);
  const nextDeadline = comingUp.find((e) => (e.kind === "due" || e.kind === "quiz") && !e.done);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span className="md:hidden">
          <HomeGreeting name={name} compact />
        </span>
        <span className="hidden md:block">
          <HomeGreeting name={name} />
        </span>
        <form action="/catalog" method="get" role="search" className="hidden lg:block">
          <SearchField name="q" placeholder="Search courses…" aria-label="Search courses" className="w-[300px]" />
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <ContinueCard course={current} />
        <div className="hidden md:flex">
          <ComingUpCard events={comingUp} now={now} />
        </div>
      </div>
      <div className="md:hidden">
        <DueNotice event={nextDeadline} />
      </div>

      <section aria-labelledby="your-courses" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="your-courses" className="m-0 text-[18px] font-semibold tracking-[-0.01em] md:text-[22px]">
            Your courses
          </h2>
          <span className="hidden md:block">
            <CourseFilterChips basePath="/" active={filter} />
          </span>
          <Link href="/courses" className="text-small md:hidden">
            See all
          </Link>
        </div>
        <div className="hidden md:block">
          <CourseGrid
            courses={filterCourses(courses, filter)}
            empty={
              <EmptyState
                title={filter === "completed" ? "Nothing finished yet" : "No courses in progress"}
                description={
                  filter === "completed"
                    ? "Courses you finish will collect here."
                    : "When you're enrolled in a published course, it shows up here."
                }
              />
            }
          />
        </div>
        <div className="md:hidden">
          {courses.length === 0 ? (
            <p className="m-0 text-small text-ink-soft">You&apos;re not enrolled in any courses yet.</p>
          ) : (
            <CompactCourseList courses={courses} />
          )}
        </div>
      </section>
    </>
  );
}
