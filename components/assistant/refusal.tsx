import { MessageCircleQuestion } from "lucide-react";
import { NewDiscussionDialog } from "@/components/discussions/new-discussion-dialog";
import { Button, Icon } from "@/components/ui";
import { draftFromQuestion } from "@/lib/discussions/view";

/* The assistant's refusal (feature 14). Fixed copy, never generated: the
   server refuses off-syllabus questions before (or instead of) any model
   answer. "Ask your instructor" (feature 21) opens a new discussion
   thread in the course, about the lesson being watched, pre-filled with
   the question the assistant couldn't answer. */
export function Refusal({
  courseTitle,
  ask,
}: {
  courseTitle: string;
  ask: {
    course: { id: string; code: string; title: string };
    lesson?: { id: string; title: string };
    question: string;
  };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-oat px-4 py-3.5">
      <p className="m-0 text-[15px] leading-[1.55]">
        That topic isn&rsquo;t part of <em>{courseTitle}</em>. I can only help with material taught in this course.
      </p>
      <NewDiscussionDialog
        courses={[ask.course]}
        lesson={ask.lesson}
        initial={draftFromQuestion(ask.question)}
        trigger={
          <Button variant="quiet" size="xs" className="self-start">
            <Icon icon={MessageCircleQuestion} size={14} />
            Ask your instructor
          </Button>
        }
      />
    </div>
  );
}

/* The private space's refusal (feature 19): the same rule over the
   student's own material, and fixed copy too. Nobody else reads these
   notes, so there's no instructor to ask. */
export function SpaceRefusal() {
  return (
    <div className="rounded-2xl border border-line bg-oat px-4 py-3.5">
      <p className="m-0 text-[15px] leading-[1.55]">
        That isn&rsquo;t covered by your material. I can only answer from what you&rsquo;ve added to your space, and from
        your courses when &ldquo;Include my courses&rdquo; is on.
      </p>
    </div>
  );
}
