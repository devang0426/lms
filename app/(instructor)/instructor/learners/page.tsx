import Link from "next/link";
import { CourseLearnersCard } from "@/components/learners/course-learners";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, EmptyState } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { loadLearners } from "@/lib/db/learners";
import { requestTime } from "@/lib/utils/clock";

export const metadata = { title: "Learners · Studyhall" };

/* Who is in each course and how they're doing (feature 31): a table per
   course the viewer teaches (admins: every course), in one batch. The
   numbers use the overview's rules, so a course's average completion here
   is the one on /instructor. A student's name opens their report. */
export default async function LearnersPage() {
  const user = await requireAreaRole("instructor", "admin");
  const now = requestTime();
  const courses = await loadLearners(user, new Date(now));

  return (
    <>
      <PageHeader eyebrow="Teaching" title="Learners" />
      {courses.length === 0 ? (
        <Card padded={false} className="border-dashed">
          <EmptyState
            title="No courses yet"
            description="Once you teach a course, everyone enrolled in it is listed here with their progress."
            action={
              <Button asChild variant="secondary" size="md">
                <Link href="/instructor/courses">Your courses</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <p className="m-0 max-w-[760px] text-small text-ink-soft">
            Lessons and quizzes count what&apos;s published. Last activity is the latest lesson watched, flashcard reviewed, quiz taken or
            work handed in. Questions to the assistant aren&apos;t shown.
          </p>
          {courses.map((c) => (
            <CourseLearnersCard key={c.course.id} data={c} now={now} withCourse />
          ))}
        </>
      )}
    </>
  );
}
