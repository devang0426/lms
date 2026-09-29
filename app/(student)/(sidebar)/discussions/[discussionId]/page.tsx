import { notFound } from "next/navigation";
import { DiscussionThreadView } from "@/components/discussions/discussion-thread";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/db/courses";
import { getDiscussionThread } from "@/lib/db/discussions";

export const metadata = { title: "Discussion · Studyhall" };

/* One discussion thread (feature 21). getDiscussionThread is the gate: a
   thread outside the viewer's courses, or about a lesson they can't open,
   is a 404. */
export default async function DiscussionPage({ params }: PageProps<"/discussions/[discussionId]">) {
  const { discussionId } = await params;
  const user = await requireUser();
  if (!isUuid(discussionId)) notFound();
  const thread = await getDiscussionThread(user, discussionId);
  if (!thread) notFound();
  const d = thread.discussion;

  return (
    <DiscussionThreadView
      thread={thread}
      backHref="/discussions"
      backLabel="All discussions"
      lessonHref={d.lessonId ? `/courses/${d.courseId}/lessons/${d.lessonId}` : null}
    />
  );
}
