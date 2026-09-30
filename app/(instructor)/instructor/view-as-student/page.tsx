import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/course-builder/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, EmptyState, Eyebrow, Icon } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { taughtCourses } from "@/lib/db/navigation";

export const metadata = { title: "View as student · Studyhall" };

/* "View as student" (feature 28, N3), from the staff sidebar and account
   menu: the course page of a course this person teaches, as its students
   see it. With one published course (or only one course) it goes straight
   there; with several, they pick. */
export default async function ViewAsStudentPage() {
  const user = await requireAreaRole("instructor", "admin");
  const taught = await taughtCourses(user.id);
  const published = taught.filter((c) => c.status === "published");
  const only = published.length === 1 ? published[0] : taught.length === 1 ? taught[0] : null;
  if (only) redirect(`/courses/${only.id}`);

  return (
    <>
      <PageHeader eyebrow="Teaching" title="View as student" />
      {taught.length === 0 ? (
        <Card padded={false} className="border-dashed">
          <EmptyState
            title="You're not teaching a course yet"
            description="Once you teach one, you can open its pages the way its students see them."
            action={
              <Button asChild variant="secondary" size="md">
                <Link href="/instructor/courses/new">New course</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <p className="m-0 px-[22px] pt-5 pb-3 text-small text-ink-soft">Which course? Its page opens the way enrolled students see it.</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {taught.map((c) => (
              <li key={c.id} className="border-t border-line">
                <Link
                  href={`/courses/${c.id}`}
                  className="flex items-center justify-between gap-3 px-[22px] py-3.5 text-ink no-underline hover:bg-oat hover:text-ink"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Eyebrow>{c.code}</Eyebrow>
                    <span className="truncate text-[15px] font-medium">{c.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={c.status} size="sm" />
                    <Icon icon={ChevronRight} size={16} className="text-ink-soft" />
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
