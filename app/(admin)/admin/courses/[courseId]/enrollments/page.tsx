import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollButton, RemoveEnrollmentButton } from "@/components/admin/enrollment-controls";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, CardHeader, DataTable, Icon, ListRow, Person, SearchField } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { getCourseWithSections, listEnrolledStudents, searchStudentsToEnroll } from "@/lib/db/enrollments";

export const metadata = { title: "Enrollments · Studyhall" };

export default async function EnrollmentsPage({
  params,
  searchParams,
}: PageProps<"/admin/courses/[courseId]/enrollments">) {
  await requireAreaRole("admin");
  const { courseId } = await params;
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";

  const data = await getCourseWithSections(courseId);
  if (!data) notFound();
  const { course, sections } = data;

  const [enrolled, matches] = await Promise.all([
    listEnrolledStudents(courseId),
    searchStudentsToEnroll(courseId, query),
  ]);
  const sectionOptions = sections.map((s) => ({ id: s.id, name: s.name }));

  return (
    <>
      <Link href="/admin/courses" className="flex items-center gap-2 text-small text-ink-soft no-underline hover:text-ink">
        <Icon icon={ArrowLeft} size={16} />
        All courses
      </Link>
      <PageHeader eyebrow={`${course.code} · Enrollments`} title={course.title} />

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card padded={false} className="overflow-x-auto">
          <div className="px-6 pt-5 pb-3">
            <CardHeader title={`Enrolled · ${enrolled.length}`} />
          </div>
          <DataTable
            className="min-w-[480px]"
            rows={enrolled}
            rowKey={(r) => r.userId}
            empty="No students enrolled yet. Search for one on the right."
            columns={[
              {
                key: "student",
                header: "Student",
                width: "2fr",
                cell: (r) => <Person name={r.name} role={r.email} src={r.imageUrl} />,
              },
              { key: "section", header: "Section", width: "1fr", cell: (r) => r.sectionName },
              {
                key: "actions",
                header: "",
                width: "auto",
                cell: (r) => <RemoveEnrollmentButton courseId={course.id} userId={r.userId} name={r.name} />,
              },
            ]}
          />
        </Card>

        <Card className="gap-4">
          <CardHeader title="Add students" />
          {sections.length === 0 ? (
            <p className="m-0 text-small text-ink-soft">This course has no sections, so nobody can be enrolled yet.</p>
          ) : (
            <>
              <form method="get" className="flex gap-2">
                <SearchField name="q" defaultValue={query} placeholder="Name or email" aria-label="Search students" className="grow" />
                <Button type="submit" variant="tertiary" size="md">
                  Search
                </Button>
              </form>
              {query && matches.length === 0 && (
                <p className="m-0 text-small text-ink-soft">No students match “{query}” who aren&apos;t already enrolled.</p>
              )}
              <div className="flex flex-col">
                {matches.map((m, i) => (
                  <ListRow
                    key={m.id}
                    divider={i < matches.length - 1}
                    title={m.name}
                    subtitle={m.email}
                    trailing={<EnrollButton courseId={course.id} userId={m.id} name={m.name} sections={sectionOptions} />}
                  />
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
