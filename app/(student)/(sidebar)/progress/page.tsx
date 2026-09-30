import Link from "next/link";
import { CourseProgressCard } from "@/components/progress/course-progress-card";
import { NextUpCard } from "@/components/progress/next-up-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadProgress } from "@/lib/db/learners";
import { requestTime } from "@/lib/utils/clock";

export const metadata = { title: "Progress · Studyhall" };

/* A student's own progress (feature 31): per course, completion, each
   lesson, quiz mastery per topic and grades so far, plus one "Next up"
   suggestion. One batch after the user lookup, reading only the viewer's
   own rows in the courses they're actively enrolled in. */
export default async function ProgressPage() {
  const user = await requireUser();
  const now = requestTime();
  const { courses, next } = await loadProgress(user, new Date(now));

  return (
    <>
      <PageHeader
        eyebrow="Progress"
        title={
          <>
            Your <em>progress</em>
          </>
        }
      />
      {courses.length === 0 ? (
        <Card padded={false} className="border-dashed">
          <EmptyState
            title="No courses yet"
            description="Once you're enrolled in a course, your lessons, quiz mastery and grades are tracked here."
            action={
              <Button asChild variant="secondary" size="md">
                <Link href="/catalog">Explore courses</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <NextUpCard next={next} now={now} />
          {courses.map((c) => (
            <CourseProgressCard key={c.course.id} progress={c} />
          ))}
        </>
      )}
    </>
  );
}
