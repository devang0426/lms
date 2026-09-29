import Link from "next/link";
import { AnnouncementList } from "@/components/announcements/announcement-list";
import { DeleteAnnouncementButton } from "@/components/announcements/delete-announcement-button";
import { PostAnnouncementDialog } from "@/components/announcements/post-announcement-dialog";
import { DiscussionList } from "@/components/discussions/discussion-list";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, CardHeader, Chip, EmptyState } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { staffAnnouncements } from "@/lib/db/announcements";
import { listCoursesForStaff } from "@/lib/db/courses";
import { listDiscussions, unansweredQuestions } from "@/lib/db/discussions";

export const metadata = { title: "Messages · Studyhall" };

type Show = "unanswered" | "all";

/* Messages (feature 21): students' questions in the courses this viewer
   teaches (unanswered first, the longest waiting at the top, or every
   thread) and the announcements posted to them. Course staff checks are
   in the queries. */
export default async function MessagesPage({ searchParams }: PageProps<"/instructor/messages">) {
  const user = await requireAreaRole("instructor", "admin");
  const { show: raw } = await searchParams;
  const show: Show = raw === "all" ? "all" : "unanswered";

  const [questions, courseRows, announcements] = await Promise.all([
    show === "all" ? listDiscussions(user) : unansweredQuestions(user),
    listCoursesForStaff(user),
    staffAnnouncements(user),
  ]);
  const courses = courseRows.map(({ course }) => ({ id: course.id, code: course.code, title: course.title }));
  const codeOf = new Map(courses.map((c) => [c.id, c.code]));

  return (
    <>
      <PageHeader eyebrow="Teaching" title="Messages" actions={<PostAnnouncementDialog courses={courses} />} />

      <section aria-labelledby="questions" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="questions" className="m-0 flex items-center gap-3 text-h2 font-semibold">
            Student questions
            {show === "unanswered" && questions.length > 0 && <Badge tone="warning">{questions.length} waiting</Badge>}
          </h2>
          <div className="flex gap-2" role="group" aria-label="Filter questions">
            <Chip asChild active={show === "unanswered"} className="h-[34px] px-3.5">
              <Link href="/instructor/messages" aria-current={show === "unanswered" ? "true" : undefined} scroll={false}>
                Unanswered
              </Link>
            </Chip>
            <Chip asChild active={show === "all"} className="h-[34px] px-3.5">
              <Link href="/instructor/messages?show=all" aria-current={show === "all" ? "true" : undefined} scroll={false}>
                All
              </Link>
            </Chip>
          </div>
        </div>
        <Card padded={false} className="overflow-hidden">
          {show === "unanswered" && questions.length > 0 && (
            <div className="bg-oat px-[22px] py-2.5 font-mono text-[11px] tracking-[0.08em] text-ink-soft uppercase">Longest waiting first</div>
          )}
          <DiscussionList
            items={questions}
            basePath="/instructor/messages"
            waiting
            empty={
              <EmptyState
                title={show === "unanswered" ? "No questions waiting" : "No discussions yet"}
                description="When a student asks a question, including from the assistant's “Ask your instructor”, it shows up here."
              />
            }
          />
        </Card>
      </section>

      <section aria-labelledby="announcements" className="flex flex-col gap-4">
        <CardHeader title={<span id="announcements">Announcements</span>} />
        {announcements.length === 0 ? (
          <Card padded={false} className="border-dashed">
            <EmptyState title="Nothing posted yet" description="Announcements appear on the course page, and every enrolled student gets a notification." />
          </Card>
        ) : (
          <AnnouncementList
            items={announcements}
            eyebrowFor={(a) => codeOf.get(a.courseId) ?? ""}
            actionFor={(a) => <DeleteAnnouncementButton id={a.id} title={a.title} />}
          />
        )}
      </section>
    </>
  );
}
