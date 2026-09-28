import { Plus } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/course-builder/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, DataTable, EmptyState, Eyebrow, Icon } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { listCoursesForStaff } from "@/lib/db/courses";

export const metadata = { title: "Courses · Studyhall" };

export default async function InstructorCoursesPage() {
  const user = await requireAreaRole("instructor", "admin");
  const rows = await listCoursesForStaff(user);

  const newCourse = (
    <Button asChild>
      <Link href="/instructor/courses/new">
        <Icon icon={Plus} />
        New course
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader eyebrow="Teaching" title="Courses" actions={newCourse} />
      <Card padded={false} className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState
            title="No courses yet"
            description="Create a course, add modules and lessons, then publish it when it's ready."
          />
        ) : (
          <DataTable
            className="min-w-[560px]"
            rows={rows}
            rowKey={(r) => r.course.id}
            columns={[
              {
                key: "course",
                header: "Course",
                width: "2.4fr",
                cell: (r) => (
                  <Link href={`/instructor/courses/${r.course.id}`} className="flex flex-col gap-0.5 no-underline">
                    <Eyebrow>{r.course.code}</Eyebrow>
                    <span className="truncate text-[15px] font-medium text-ink">{r.course.title}</span>
                  </Link>
                ),
              },
              { key: "status", header: "Status", width: "1fr", cell: (r) => <StatusBadge status={r.course.status} size="md" /> },
              {
                key: "lessons",
                header: "Lessons",
                width: "1.2fr",
                cell: (r) => (
                  <span className="text-ink-soft">
                    {r.publishedLessonCount} of {r.lessonCount} published
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
