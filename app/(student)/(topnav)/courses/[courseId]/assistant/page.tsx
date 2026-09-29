import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { Button, Eyebrow, Icon } from "@/components/ui";
import { toTurnView } from "@/lib/ai/assistant";
import { requireAreaRole } from "@/lib/auth";
import { chapterTitles, latestThread } from "@/lib/db/chat";
import { getCourseForUser } from "@/lib/db/courses";

/* The course assistant, course-wide (feature 14). Same gate as course
   detail: enrolled students (published lessons only) and staff; anyone
   else gets a 404. Chips open the cited lesson at the moment. */
export default async function CourseAssistantPage({ params }: PageProps<"/courses/[courseId]/assistant">) {
  const { courseId } = await params;
  const user = await requireAreaRole("student", "admin");
  const full = await getCourseForUser(courseId, user);
  if (!full) notFound();
  const { course } = full;
  const lessonIds = full.modules.flatMap((m) => m.lessons.map((l) => l.id));

  const [thread, suggestions] = await Promise.all([
    latestThread({ userId: user.id, courseId, lessonId: null }),
    chapterTitles(lessonIds, 4),
  ]);

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
