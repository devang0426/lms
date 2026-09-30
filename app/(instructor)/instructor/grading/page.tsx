import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { LocalDate } from "@/components/coursework/local-date";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Button, Card, EmptyState, Icon } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { gradingQueue } from "@/lib/db/grades";

export const metadata = { title: "Grading · Studyhall" };

/* The grading queue (feature 20; the wireframe's "Needs grading" list):
   handed-in work in the courses this viewer teaches, oldest first. A
   draft grade stays here until it's returned. The course-staff check is
   in the query. */
export default async function GradingQueuePage() {
  const user = await requireAreaRole("instructor", "admin");
  const queue = await gradingQueue(user);

  return (
    <>
      <PageHeader
        eyebrow="Grading"
        title={
          <>
            Needs <em>grading</em>
          </>
        }
        actions={queue.length > 0 && <Badge tone="warning">{queue.length} waiting</Badge>}
      />
      {queue.length === 0 ? (
        <Card padded={false} className="border-dashed">
          <EmptyState
            title="Nothing to grade"
            description="Handed-in work shows up here, oldest first. Set an assignment: add an Assignment lesson to a course."
            action={
              <Button asChild variant="secondary" size="md">
                <Link href="/instructor/courses">Your courses</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="bg-oat px-[22px] py-2.5 font-mono text-[11px] tracking-[0.08em] text-ink-soft uppercase">Oldest first</div>
          <ul className="m-0 flex list-none flex-col p-0">
            {queue.map((item) => (
              <li key={item.submissionId} className="border-b border-line last:border-b-0">
                <Link
                  href={`/instructor/grading/${item.submissionId}`}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[22px] py-4 text-ink no-underline hover:bg-oat hover:text-ink"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] font-medium">{item.student.name}</span>
                    <span className="text-meta text-ink-soft">
                      {item.course.code} · {item.assignment.title} · {item.assignment.points} points
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2.5 text-meta text-ink-soft">
                    <span>
                      Handed in <LocalDate at={item.submittedAt.getTime()} />
                    </span>
                    {item.late && (
                      <Badge tone="warning" size="md">
                        Late
                      </Badge>
                    )}
                    {item.status === "graded" && (
                      <Badge tone="neutral" size="md">
                        Draft grade
                      </Badge>
                    )}
                    <Icon icon={ChevronRight} size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
