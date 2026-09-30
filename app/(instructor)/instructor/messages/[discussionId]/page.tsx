import { notFound } from "next/navigation";
import { DiscussionThreadView } from "@/components/discussions/discussion-thread";
import { requireAreaRole } from "@/lib/auth";
import { isUuid } from "@/lib/db/courses";
import { getDiscussionThread } from "@/lib/db/discussions";

export const metadata = { title: "Question · Studyhall" };

/* A discussion thread for staff (feature 21): reply, and mark the answer.
   getDiscussionThread is the gate (a thread outside the viewer's courses
   is a 404); canModerate says whether they teach this course. */
export default async function StaffDiscussionPage({ params }: PageProps<"/instructor/messages/[discussionId]">) {
  const { discussionId } = await params;
  const user = await requireAreaRole("instructor", "admin");
  if (!isUuid(discussionId)) notFound();
  const thread = await getDiscussionThread(user, discussionId);
  if (!thread) notFound();
  const d = thread.discussion;

  return (
    <DiscussionThreadView
      thread={thread}
      backHref="/instructor/messages"
      backLabel="Questions"
      // Staff open the lesson in the player's preview.
      lessonHref={d.lessonId ? `/courses/${d.courseId}/lessons/${d.lessonId}` : null}
    />
  );
}
