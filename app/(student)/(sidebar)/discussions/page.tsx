import { MessageCirclePlus } from "lucide-react";
import Link from "next/link";
import { DiscussionList } from "@/components/discussions/discussion-list";
import { NewDiscussionDialog } from "@/components/discussions/new-discussion-dialog";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, Chip, EmptyState, Icon } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listCoursesForStaff, listCoursesForStudent } from "@/lib/db/courses";
import { listDiscussions } from "@/lib/db/discussions";

export const metadata = { title: "Discussions · Studyhall" };

type Show = "all" | "mine" | "open";
const FILTERS: { value: Show; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "My questions" },
  { value: "open", label: "Unanswered" },
];

/* Course discussions (feature 21): question threads in the viewer's
   courses, most recently active first. ?show= filters (so the back button
   works). "Ask a question" is the page's one action. What's listed is
   decided in the query (lib/db/discussions.ts). */
export default async function DiscussionsPage({ searchParams }: PageProps<"/discussions">) {
  const user = await requireUser();
  const { show: raw } = await searchParams;
  const show: Show = raw === "mine" || raw === "open" ? raw : "all";

  const [threads, courseRows] = await Promise.all([
    listDiscussions(user, { mineOnly: show === "mine", status: show === "open" ? "open" : undefined }),
    user.role === "student" ? listCoursesForStudent(user.id) : listCoursesForStaff(user),
  ]);
  const courses = courseRows.map(({ course }) => ({ id: course.id, code: course.code, title: course.title }));

  return (
    <>
      <PageHeader
        eyebrow="Discussions"
        title={
          <>
            Questions and <em>answers</em>
          </>
        }
        actions={
          courses.length > 0 && (
            <NewDiscussionDialog
              courses={courses}
              openAfterPost
              trigger={<Button leading={<Icon icon={MessageCirclePlus} size={18} />}>Ask a question</Button>}
            />
          )
        }
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter discussions">
        {FILTERS.map((f) => (
          <Chip key={f.value} asChild active={f.value === show} className="h-[34px] px-3.5">
            <Link href={f.value === "all" ? "/discussions" : `/discussions?show=${f.value}`} aria-current={f.value === show ? "true" : undefined} scroll={false}>
              {f.label}
            </Link>
          </Chip>
        ))}
      </div>
      <Card padded={false} className="overflow-hidden">
        <DiscussionList
          items={threads}
          basePath="/discussions"
          empty={
            <EmptyState
              title={show === "mine" ? "You haven't asked anything yet" : show === "open" ? "Every question has an answer" : "No discussions yet"}
              description="Ask about anything in your courses. Your instructor and classmates can reply, and you'll get a notification when they do."
            />
          }
        />
      </Card>
    </>
  );
}
