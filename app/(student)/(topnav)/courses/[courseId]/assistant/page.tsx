import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { Button, Eyebrow, Icon } from "@/components/ui";
import { toTurnView } from "@/lib/ai/assistant";
import { requireAreaRole } from "@/lib/auth";
import { chapterTitlesQuery, latestThreadQueries, toChapterTitles, toLatestThread } from "@/lib/db/chat";
import { db } from "@/lib/db/client";
import { courseDetailFor } from "@/lib/db/course-page";

/* The course assistant, course-wide (feature 14). Same gate as course
   detail: enrolled students (published lessons only) and staff; anyone
   else gets a 404. Chips open the cited lesson at the moment.
   Feature 29: the course comes from the batch the layout's breadcrumb
   already reads (courseDetailFor), then one batch for the thread and the
   suggestions. */
export default async function CourseAssistantPage({ params }: PageProps<"/courses/[courseId]/assistant">) {
  const { courseId } = await params;
  const user = await requireAreaRole("student", "admin", "instructor");
  const full = (await courseDetailFor(courseId, user))?.full ?? null;
  // Instructors get in only to the courses they teach (feature 28).
  if (user.role === "instructor" && full?.access !== "staff") redirect("/instructor");
  if (!full) notFound();
  const { course } = full;
  const lessonIds = full.modules.flatMap((m) => m.lessons.map((l) => l.id));

  const [threadRow, turns, titles] = await db.batch([
    ...latestThreadQueries({ userId: user.id, courseId, lessonId: null }),
    chapterTitlesQuery(lessonIds, 4),
  ]);
  const thread = toLatestThread([threadRow, turns]);
  const suggestions = toChapterTitles(titles, 4);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="link" size="xs" className="self-start px-0">
          <Link href={`/courses/${courseId}`}>
            <Icon icon={ArrowLeft} size={14} />
            Back to course
          </Link>
        </Button>
        <Eyebrow size={12}>{course.code} · Course assistant</Eyebrow>
        <h1 className="m-0 font-serif text-[36px] leading-[1.1] font-normal md:text-[44px]">
          Ask about <em>{course.title}</em>
        </h1>
      </div>
      <AssistantChat
        courseId={courseId}
        courseCode={course.code}
        courseTitle={course.title}
        initialThread={thread && { id: thread.id, turns: thread.turns.map(toTurnView) }}
        suggestions={suggestions}
        primary
      />
    </div>
  );
}
