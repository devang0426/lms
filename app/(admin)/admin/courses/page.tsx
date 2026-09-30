import Link from "next/link";
import { StatusBadge } from "@/components/course-builder/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, DataTable, EmptyState, Eyebrow } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { listAllCoursesWithEnrollment } from "@/lib/db/enrollments";

export const metadata = { title: "Courses and enrollments · Studyhall" };

export default async function AdminCoursesPage() {
  await requireAreaRole("admin");
  const rows = await listAllCoursesWithEnrollment();

  return (
    <>
      <PageHeader eyebrow="Admin" title="Courses and enrollments" />
      <Card padded={false} className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title="No courses yet" description="Courses appear here once an instructor creates one." />
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
                // The title opens the course builder (feature 28); admins are staff everywhere.
                cell: (r) => (
                  <Link href={`/instructor/courses/${r.course.id}`} className="flex min-w-0 flex-col gap-0.5 text-ink no-underline hover:text-terracotta">
                    <Eyebrow>{r.course.code}</Eyebrow>
                    <span className="truncate text-[15px] font-medium">{r.course.title}</span>
                  </Link>
                ),
              },
              { key: "status", header: "Status", width: "1fr", cell: (r) => <StatusBadge status={r.course.status} size="md" /> },
              { key: "students", header: "Students", width: "1fr", cell: (r) => r.students },
              {
                key: "manage",
                header: "",
                width: "auto",
                cell: (r) => (
                  <Button asChild variant="quiet" size="xs">
                    <Link href={`/admin/courses/${r.course.id}/enrollments`} aria-label={`Enrollments for ${r.course.code}`}>
                      Enrollments
                    </Link>
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
